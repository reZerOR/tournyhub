import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createPlayerEntry } from "@/server/auction-command/player-entries";
import { syncAuctionReadiness } from "@/server/auction-command/readiness";
import { assignPlayerRepresentative } from "@/server/auction-command/representatives";
import { saveTieredRules } from "@/server/auction-command/rules";
import { startAuction } from "@/server/auction-command/start-auction";
import { createTeam } from "@/server/auction-command/teams";
import {
  assignPlayerTier,
  createTier,
  deleteTier,
  reorderTiers,
  TierSetupError,
  updateTier,
} from "@/server/auction-command/tiers";
import { getTiersForOrganizer } from "@/server/auction-query/tiers";
import {
  cleanupTestUsers,
  createTestAuction,
  createTestUser,
  createTestUserWithEmail,
  pool,
  uniqueTestEmail,
} from "./support";

afterAll(cleanupTestUsers);

afterEach(async () => {
  await pool.query(
    `update "auction" set "status" = 'draft' where "status" = 'live'`,
  );
});

async function registerRep(label: string): Promise<string> {
  const email = uniqueTestEmail(label);
  await createTestUserWithEmail(email, label);
  return email;
}

interface ReadyTieredAuction {
  auctionId: string;
  bluesTeamId: string;
  bronzeTierId: string;
  goldTierId: string;
  organizerId: string;
  redsTeamId: string;
}

/**
 * A Tiered Draft Auction that satisfies every Readiness requirement: two named
 * Teams with Player Representatives, Tiered Rules, ordered Tiers, every
 * biddable Player assigned, and a Legal Completion.
 */
async function buildReadyTieredAuction(
  label: string,
): Promise<ReadyTieredAuction> {
  const organizerId = await createTestUser(label);
  const auction = await createTestAuction(organizerId, {
    rulesMode: "tiered",
  });
  const auctionId = auction.id;

  const reds = await createTeam(pool, organizerId, auctionId, { name: "Reds" });
  const blues = await createTeam(pool, organizerId, auctionId, {
    name: "Blues",
  });

  const bronze = await createTier(pool, organizerId, auctionId, {
    label: "Bronze",
    maxPerTeam: 2,
    minPerTeam: 1,
    startingPrice: 10,
  });
  const gold = await createTier(pool, organizerId, auctionId, {
    label: "Gold",
    maxPerTeam: 1,
    minPerTeam: 1,
    startingPrice: 50,
  });

  const alice = await createPlayerEntry(pool, organizerId, auctionId, {
    displayName: "Alice",
  });
  const bob = await createPlayerEntry(pool, organizerId, auctionId, {
    displayName: "Bob",
  });
  const bronzePlayers = [
    await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "Bronze One",
    }),
    await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "Bronze Two",
    }),
  ];
  const goldPlayers = [
    await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "Gold One",
    }),
    await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "Gold Two",
    }),
  ];

  await assignPlayerRepresentative(pool, organizerId, auctionId, {
    email: await registerRep(`${label}-rep-reds`),
    playerEntryId: alice!.id,
    teamId: reds!.id,
  });
  await assignPlayerRepresentative(pool, organizerId, auctionId, {
    email: await registerRep(`${label}-rep-blues`),
    playerEntryId: bob!.id,
    teamId: blues!.id,
  });
  await assignPlayerTier(pool, organizerId, auctionId, alice!.id, bronze!.id);
  await assignPlayerTier(pool, organizerId, auctionId, bob!.id, bronze!.id);
  for (const entry of bronzePlayers) {
    await assignPlayerTier(pool, organizerId, auctionId, entry!.id, bronze!.id);
  }
  for (const entry of goldPlayers) {
    await assignPlayerTier(pool, organizerId, auctionId, entry!.id, gold!.id);
  }

  await saveTieredRules(pool, organizerId, auctionId, {
    bidIncrement: 5,
    budget: 100,
    rosterMax: 4,
    rosterMin: 3,
  });

  return {
    auctionId,
    bluesTeamId: blues!.id,
    bronzeTierId: bronze!.id,
    goldTierId: gold!.id,
    organizerId,
    redsTeamId: reds!.id,
  };
}

describe("Tier commands", () => {
  it("creates, renames, and reorders ordered Tiers", async () => {
    const organizerId = await createTestUser("tier-crud");
    const auction = await createTestAuction(organizerId, {
      rulesMode: "tiered",
    });

    const bronze = await createTier(pool, organizerId, auction.id, {
      label: "Bronze",
      maxPerTeam: 2,
      minPerTeam: 1,
      startingPrice: 10,
    });
    const silver = await createTier(pool, organizerId, auction.id, {
      label: "Silver",
      maxPerTeam: 2,
      minPerTeam: 1,
      startingPrice: 20,
    });
    const gold = await createTier(pool, organizerId, auction.id, {
      label: "Gold",
      maxPerTeam: 1,
      minPerTeam: 0,
      startingPrice: 50,
    });

    expect([bronze!.position, silver!.position, gold!.position]).toEqual([
      0, 1, 2,
    ]);

    const renamed = await updateTier(
      pool,
      organizerId,
      auction.id,
      silver!.id,
      {
        label: "Silver Medal",
        maxPerTeam: 3,
        minPerTeam: 1,
        startingPrice: 25,
      },
    );
    expect(renamed).toMatchObject({
      label: "Silver Medal",
      maxPerTeam: 3,
      startingPrice: 25,
    });

    const reordered = await reorderTiers(pool, organizerId, auction.id, {
      orderedTierIds: [gold!.id, bronze!.id, silver!.id],
    });
    expect(reordered?.map((tier) => tier.label)).toEqual([
      "Gold",
      "Bronze",
      "Silver Medal",
    ]);
    expect(reordered?.map((tier) => tier.position)).toEqual([0, 1, 2]);

    expect(await deleteTier(pool, organizerId, auction.id, gold!.id)).toBe(
      true,
    );
    const remaining = await getTiersForOrganizer(pool, organizerId, auction.id);
    expect(remaining?.map((tier) => tier.label)).toEqual([
      "Bronze",
      "Silver Medal",
    ]);
  });

  it("rejects a duplicate Tier name", async () => {
    const organizerId = await createTestUser("tier-duplicate");
    const auction = await createTestAuction(organizerId, {
      rulesMode: "tiered",
    });

    await createTier(pool, organizerId, auction.id, {
      label: "Gold",
      maxPerTeam: 1,
      minPerTeam: 0,
      startingPrice: 50,
    });

    await expect(
      createTier(pool, organizerId, auction.id, {
        label: "  gold ",
        maxPerTeam: 1,
        minPerTeam: 0,
        startingPrice: 50,
      }),
    ).rejects.toThrow(TierSetupError);
  });

  it("assigns a Player to a Tier and back to unassigned", async () => {
    const organizerId = await createTestUser("tier-assign");
    const auction = await createTestAuction(organizerId, {
      rulesMode: "tiered",
    });
    const tier = await createTier(pool, organizerId, auction.id, {
      label: "Gold",
      maxPerTeam: 1,
      minPerTeam: 0,
      startingPrice: 50,
    });
    const player = await createPlayerEntry(pool, organizerId, auction.id, {
      displayName: "Player",
    });

    expect(
      await assignPlayerTier(
        pool,
        organizerId,
        auction.id,
        player!.id,
        tier!.id,
      ),
    ).toBe(true);
    let row = await pool.query<{ tier_id: null | string }>(
      `select "tier_id" from "player_entry" where "id" = $1`,
      [player!.id],
    );
    expect(row.rows[0]!.tier_id).toBe(tier!.id);

    await assignPlayerTier(pool, organizerId, auction.id, player!.id, null);
    row = await pool.query<{ tier_id: null | string }>(
      `select "tier_id" from "player_entry" where "id" = $1`,
      [player!.id],
    );
    expect(row.rows[0]!.tier_id).toBeNull();
  });
});

describe("saveTieredRules", () => {
  it("persists the shared Tiered Rules", async () => {
    const organizerId = await createTestUser("tiered-rules");
    const auction = await createTestAuction(organizerId, {
      rulesMode: "tiered",
    });

    const saved = await saveTieredRules(pool, organizerId, auction.id, {
      bidIncrement: "5",
      budget: "100",
      rosterMax: "4",
      rosterMin: "3",
    });

    expect(saved).toMatchObject({
      bidIncrement: 5,
      budget: 100,
      defaultStartingPrice: null,
      rosterMax: 4,
      rosterMin: 3,
    });
  });

  it("refuses a Simple Auction", async () => {
    const organizerId = await createTestUser("tiered-rules-simple");
    const auction = await createTestAuction(organizerId);

    await expect(
      saveTieredRules(pool, organizerId, auction.id, {
        bidIncrement: 5,
        budget: 100,
        rosterMax: 4,
        rosterMin: 3,
      }),
    ).rejects.toThrow(/Simple Rules/);
  });
});

describe("Tiered readiness and start", () => {
  it("becomes Ready, then returns to Draft when a Tier edit breaks feasibility", async () => {
    const { auctionId, goldTierId, organizerId } =
      await buildReadyTieredAuction("tiered-ready");

    const readiness = await syncAuctionReadiness(pool, organizerId, auctionId);
    expect(readiness?.ready).toBe(true);

    // Removing a Gold Player makes the Gold minimum impossible without
    // deleting any Team or invitation.
    const goldPlayers = await pool.query<{ id: string }>(
      `select "id" from "player_entry"
        where "auction_id" = $1 and "tier_id" = $2 and not "is_representative"`,
      [auctionId, goldTierId],
    );
    await pool.query(`delete from "player_entry" where "id" = $1`, [
      goldPlayers.rows[0]!.id,
    ]);

    const afterEdit = await syncAuctionReadiness(pool, organizerId, auctionId);
    expect(afterEdit?.ready).toBe(false);

    const auction = await pool.query<{ status: string }>(
      `select "status" from "auction" where "id" = $1`,
      [auctionId],
    );
    expect(auction.rows[0]!.status).toBe("draft");
    const teams = await pool.query<{ count: number }>(
      `select count(*)::int as count from "team" where "auction_id" = $1`,
      [auctionId],
    );
    expect(teams.rows[0]!.count).toBe(2);
  });

  it("freezes Tier order and Tier Starting Prices and excludes representatives from bidding", async () => {
    const { auctionId, organizerId } =
      await buildReadyTieredAuction("tiered-start");

    const started = await startAuction(pool, organizerId, auctionId);
    expect(started?.revision).toBe(1);

    const auction = await pool.query<{
      active_tier_id: null | string;
      revision: number;
      status: string;
    }>(
      `select "status", "revision", "active_tier_id" from "auction" where "id" = $1`,
      [auctionId],
    );
    expect(auction.rows[0]!.status).toBe("live");
    expect(auction.rows[0]!.active_tier_id).not.toBeNull();

    const tiers = await pool.query<{ id: string; position: number }>(
      `select "id", "position" from "tier"
        where "auction_id" = $1 order by "position" asc`,
      [auctionId],
    );
    expect(auction.rows[0]!.active_tier_id).toBe(tiers.rows[0]!.id);

    const revision = await pool.query<{
      payload: {
        players: {
          is_representative: boolean;
          starting_price: number;
          tier_id: null | string;
        }[];
        tiers: { id: string; position: number; starting_price: number }[];
      };
    }>(
      `select "payload" from "auction_revision" where "auction_id" = $1 and "revision" = 1`,
      [auctionId],
    );
    const payload = revision.rows[0]!.payload;
    expect(payload.tiers.map((tier) => tier.position)).toEqual([0, 1]);
    expect(payload.tiers.map((tier) => tier.starting_price)).toEqual([10, 50]);

    const biddable = payload.players.filter(
      (player) => !player.is_representative,
    );
    expect(biddable.map((player) => player.starting_price)).toEqual([
      10, 10, 50, 50,
    ]);
    expect(
      payload.players.filter((player) => player.is_representative),
    ).toHaveLength(2);
  });

  it("refuses to start a Tiered Auction with an unassigned Player", async () => {
    const { auctionId, organizerId } =
      await buildReadyTieredAuction("tiered-unassigned");
    const player = await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "Unassigned",
    });
    expect(player).not.toBeNull();

    await expect(startAuction(pool, organizerId, auctionId)).rejects.toThrow(
      /Readiness/,
    );
  });
});
