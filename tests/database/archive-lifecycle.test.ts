import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  ArchiveError,
  archiveAuction,
  purgeExpiredArchivedAuctions,
  restoreAuction,
} from "@/server/auction-command/archive";
import { copyAuction } from "@/server/auction-command/copy-auction";
import {
  createPlayerEntry,
  createCustomPlayerField,
} from "@/server/auction-command/player-entries";
import { assignPlayerRepresentative } from "@/server/auction-command/representatives";
import { saveTieredRules } from "@/server/auction-command/rules";
import { assignPlayerTier, createTier } from "@/server/auction-command/tiers";
import { createTeam } from "@/server/auction-command/teams";
import { createTeamInvitation } from "@/server/auction-command/team-invitations";
import { getOrganizerAuctions } from "@/server/auction-query/auction-query";
import { getArchivedAuctionViewsForOrganizer } from "@/server/auction-query/lifecycle";
import {
  cleanupTestUsers,
  createTestAuction,
  createTestUser,
  createTestUserWithEmail,
  pool,
  uniqueTestEmail,
} from "./support";

afterAll(cleanupTestUsers);
beforeEach(async () => {
  await cleanupTestUsers();
});

interface CopySource {
  auctionId: string;
  organizerId: string;
  playerEntryId: string;
  teamId: string;
  tierId: string;
}

/** A Tiered Draft with Rules, a Team, a Representative, an invitation, and one Player. */
async function buildCopySource(label: string): Promise<CopySource> {
  const organizerId = await createTestUser(label);
  const auction = await createTestAuction(organizerId, {
    rulesMode: "tiered",
    title: "Source Auction",
  });
  const auctionId = auction.id;

  const tier = await createTier(pool, organizerId, auctionId, {
    label: "Bronze",
    maxPerTeam: 2,
    minPerTeam: 1,
    startingPrice: 15,
  });
  const field = await createCustomPlayerField(pool, organizerId, auctionId, {
    label: "Nickname",
  });
  const entry = await createPlayerEntry(pool, organizerId, auctionId, {
    customValues: { [field!.id]: "The Wall" },
    displayName: "Alice",
    externalPlayerId: "UID-1",
    phoneNumber: "+880111",
    role: "Captain",
    startingPriceOverride: "25",
  });
  await assignPlayerTier(pool, organizerId, auctionId, entry!.id, tier!.id);
  await saveTieredRules(pool, organizerId, auctionId, {
    bidIncrement: 5,
    budget: 100,
    rosterMax: 3,
    rosterMin: 2,
  });

  const team = await createTeam(pool, organizerId, auctionId, { name: "Reds" });
  const repEmail = uniqueTestEmail(`${label}-rep`);
  await createTestUserWithEmail(repEmail, "rep");
  await assignPlayerRepresentative(pool, organizerId, auctionId, {
    email: repEmail,
    playerEntryId: entry!.id,
    teamId: team!.id,
  });
  await createTeamInvitation(pool, organizerId, auctionId, {
    email: uniqueTestEmail(`${label}-invite`),
    teamId: team!.id,
  });

  return {
    auctionId,
    organizerId,
    playerEntryId: entry!.id,
    teamId: team!.id,
    tierId: tier!.id,
  };
}

async function countFor(table: string, auctionId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from "${table}" where "auction_id" = $1`,
    [auctionId],
  );
  return result.rows[0]!.count;
}

describe("copyAuction", () => {
  it("copies Rules, fields, and the selected Players while retaining Tier and price data on request", async () => {
    const source = await buildCopySource("copy-keep");

    const copied = await copyAuction(pool, source.organizerId, {
      keepTierAndPrice: true,
      playerEntryIds: [source.playerEntryId],
      sourceAuctionId: source.auctionId,
      title: "Copied Auction",
    });
    expect(copied).not.toBeNull();
    const newId = copied!.auctionId;
    expect(newId).not.toBe(source.auctionId);
    expect(copied!.copiedPlayerCount).toBe(1);

    const auction = await pool.query<{ status: string; title: string }>(
      `select "status", "title" from "auction" where "id" = $1`,
      [newId],
    );
    expect(auction.rows[0]).toMatchObject({
      status: "draft",
      title: "Copied Auction",
    });

    const rules = await pool.query<{ budget: number }>(
      `select "budget" from "auction_rule_set" where "auction_id" = $1`,
      [newId],
    );
    expect(rules.rows[0]!.budget).toBe(100);

    const fields = await pool.query<{ label: string }>(
      `select "label" from "custom_player_field" where "auction_id" = $1`,
      [newId],
    );
    expect(fields.rows.map((row) => row.label)).toEqual(["Nickname"]);

    const players = await pool.query<{
      display_name: string;
      external_player_id: string;
      phone_number: string;
      role: string;
      starting_price_override: null | number;
      tier_id: null | string;
    }>(
      `select "display_name", "role", "external_player_id", "phone_number",
              "tier_id", "starting_price_override"
         from "player_entry" where "auction_id" = $1`,
      [newId],
    );
    expect(players.rows).toHaveLength(1);
    expect(players.rows[0]).toMatchObject({
      display_name: "Alice",
      external_player_id: "UID-1",
      phone_number: "+880111",
      role: "Captain",
      starting_price_override: 25,
    });
    expect(players.rows[0]!.tier_id).not.toBeNull();

    const values = await pool.query<{ value: string }>(
      `select pcv."value" from "player_entry_custom_value" pcv
        join "player_entry" pe on pe."id" = pcv."player_entry_id"
       where pe."auction_id" = $1`,
      [newId],
    );
    expect(values.rows.map((row) => row.value)).toEqual(["The Wall"]);

    const tiers = await pool.query<{ label: string; starting_price: number }>(
      `select "label", "starting_price" from "tier" where "auction_id" = $1`,
      [newId],
    );
    expect(tiers.rows).toEqual([{ label: "Bronze", starting_price: 15 }]);

    // Authority and history never copy.
    expect(await countFor("team", newId)).toBe(0);
    expect(await countFor("team_invitation", newId)).toBe(0);
    expect(await countFor("sale", newId)).toBe(0);
    expect(await countFor("audit_entry", newId)).toBe(0);

    // The source is untouched.
    expect(await countFor("player_entry", source.auctionId)).toBe(1);
    expect(await countFor("team", source.auctionId)).toBe(1);
  });

  it("copies Player identities but leaves Tiers and Starting Prices to be assigned again", async () => {
    const source = await buildCopySource("copy-reset");

    const copied = await copyAuction(pool, source.organizerId, {
      keepTierAndPrice: false,
      playerEntryIds: [source.playerEntryId],
      sourceAuctionId: source.auctionId,
      title: "Fresh Auction",
    });
    const newId = copied!.auctionId;

    const players = await pool.query<{
      display_name: string;
      phone_number: string;
      starting_price_override: null | number;
      tier_id: null | string;
    }>(
      `select "display_name", "phone_number", "tier_id",
              "starting_price_override"
         from "player_entry" where "auction_id" = $1`,
      [newId],
    );
    expect(players.rows[0]).toMatchObject({
      display_name: "Alice",
      phone_number: "+880111",
      starting_price_override: null,
      tier_id: null,
    });
    expect(await countFor("tier", newId)).toBe(0);
  });

  it("refuses another Organizer's Auction and an Archived source", async () => {
    const source = await buildCopySource("copy-guards");
    const stranger = await createTestUser("copy-stranger");

    expect(
      await copyAuction(pool, stranger, {
        keepTierAndPrice: false,
        playerEntryIds: [],
        sourceAuctionId: source.auctionId,
        title: "Stolen",
      }),
    ).toBeNull();

    await archiveAuction(pool, source.organizerId, source.auctionId);
    expect(
      await copyAuction(pool, source.organizerId, {
        keepTierAndPrice: false,
        playerEntryIds: [],
        sourceAuctionId: source.auctionId,
        title: "From archive",
      }),
    ).toBeNull();
  });
});

describe("archive and restore", () => {
  it("hides an archived Auction from the lists, rejects its commands, and restores it", async () => {
    const organizerId = await createTestUser("archive-draft");
    const auction = await createTestAuction(organizerId, {
      title: "Archivable",
    });

    const archived = await archiveAuction(pool, organizerId, auction.id);
    expect(archived?.previousStatus).toBe("draft");
    const deadline = new Date(archived!.archiveDeadline);
    expect(deadline.getTime() - Date.now()).toBeGreaterThan(
      6.9 * 24 * 60 * 60 * 1000,
    );

    expect(
      (await getOrganizerAuctions(pool, organizerId)).some(
        (row) => row.id === auction.id,
      ),
    ).toBe(false);
    const archivedViews = await getArchivedAuctionViewsForOrganizer(
      pool,
      organizerId,
    );
    expect(archivedViews.map((view) => view.auction.id)).toContain(auction.id);

    // Ordinary Auction commands refuse an Archived Auction.
    expect(
      await createPlayerEntry(pool, organizerId, auction.id, {
        displayName: "Late",
      }),
    ).toBeNull();

    expect(await restoreAuction(pool, organizerId, auction.id)).toMatchObject({
      status: "draft",
    });
    expect(
      (await getOrganizerAuctions(pool, organizerId)).some(
        (row) => row.id === auction.id,
      ),
    ).toBe(true);
  });

  it("refuses to archive a Live Auction and another Organizer's Auction", async () => {
    const organizerId = await createTestUser("archive-guards");
    const auction = await createTestAuction(organizerId);
    await pool.query(`update "auction" set "status" = 'live' where "id" = $1`, [
      auction.id,
    ]);

    await expect(
      archiveAuction(pool, organizerId, auction.id),
    ).rejects.toBeInstanceOf(ArchiveError);

    const stranger = await createTestUser("archive-stranger");
    await pool.query(
      `update "auction" set "status" = 'draft' where "id" = $1`,
      [auction.id],
    );
    expect(await archiveAuction(pool, stranger, auction.id)).toBeNull();
    expect(await restoreAuction(pool, stranger, auction.id)).toBeNull();
  });

  it("closes the recovery window at the deadline and purges idempotently", async () => {
    const organizerId = await createTestUser("archive-window");
    const expired = await createTestAuction(organizerId, { title: "Expired" });
    const restored = await createTestAuction(organizerId, {
      title: "Restored",
    });

    await archiveAuction(pool, organizerId, expired.id);
    await archiveAuction(pool, organizerId, restored.id);
    // Simulate the window passing for one Auction only.
    await pool.query(
      `update "auction" set "archive_deadline" = now() - interval '1 second'
        where "id" = $1`,
      [expired.id],
    );
    await restoreAuction(pool, organizerId, restored.id);

    await expect(
      restoreAuction(pool, organizerId, expired.id),
    ).rejects.toBeInstanceOf(ArchiveError);

    expect(await purgeExpiredArchivedAuctions(pool)).toBe(1);
    // Idempotent, and a restored Auction is never deleted.
    expect(await purgeExpiredArchivedAuctions(pool)).toBe(0);

    const remaining = await pool.query<{ count: number }>(
      `select count(*)::int as count from "auction"
        where "id" = any($1::uuid[])`,
      [[expired.id, restored.id]],
    );
    expect(remaining.rows[0]!.count).toBe(1);
    const survivor = await pool.query<{ id: string }>(
      `select "id" from "auction" where "id" = $1`,
      [restored.id],
    );
    expect(survivor.rows).toHaveLength(1);
  });
});
