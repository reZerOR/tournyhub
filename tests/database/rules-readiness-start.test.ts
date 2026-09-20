import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createPlayerEntry } from "@/server/auction-command/player-entries";
import { syncAuctionReadiness } from "@/server/auction-command/readiness";
import { assignPlayerRepresentative } from "@/server/auction-command/representatives";
import {
  RuleSetupError,
  saveSimpleRules,
} from "@/server/auction-command/rules";
import {
  AuctionStartError,
  startAuction,
} from "@/server/auction-command/start-auction";
import { createTeam } from "@/server/auction-command/teams";
import { getReadinessForOrganizer } from "@/server/auction-query/readiness";
import {
  cleanupTestUsers,
  createTestAuction,
  createTestUser,
  createTestUserWithEmail,
  pool,
  uniqueTestEmail,
} from "./support";

afterAll(cleanupTestUsers);

// Only the start tests create a Live Auction, and the beta allows exactly one
// across the service. Reset it so each test starts from a clean service.
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

interface ReadyAuction {
  auctionId: string;
  bluesTeamId: string;
  organizerId: string;
  redsTeamId: string;
}

/**
 * A Draft Auction that satisfies every Simple Rules Readiness requirement:
 * two named Teams, a Player Representative each, valid Rules, and enough
 * Players for a Legal Completion.
 */
async function buildReadyAuction(label: string): Promise<ReadyAuction> {
  const organizerId = await createTestUser(label);
  const auction = await createTestAuction(organizerId);
  const auctionId = auction.id;

  const reds = await createTeam(pool, organizerId, auctionId, {
    name: "Reds",
  });
  const blues = await createTeam(pool, organizerId, auctionId, {
    name: "Blues",
  });

  const alice = await createPlayerEntry(pool, organizerId, auctionId, {
    displayName: "Alice",
  });
  const bob = await createPlayerEntry(pool, organizerId, auctionId, {
    displayName: "Bob",
  });
  await createPlayerEntry(pool, organizerId, auctionId, {
    displayName: "Carol",
  });
  await createPlayerEntry(pool, organizerId, auctionId, {
    displayName: "Dave",
  });

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

  await saveSimpleRules(pool, organizerId, auctionId, {
    bidIncrement: 5,
    budget: 100,
    defaultStartingPrice: 10,
    rosterMax: 3,
    rosterMin: 2,
  });

  return {
    auctionId,
    bluesTeamId: blues!.id,
    organizerId,
    redsTeamId: reds!.id,
  };
}

describe("saveSimpleRules", () => {
  it("persists the shared Simple Rules", async () => {
    const organizerId = await createTestUser("rules");
    const auction = await createTestAuction(organizerId);

    const saved = await saveSimpleRules(pool, organizerId, auction.id, {
      bidIncrement: "5",
      budget: "100",
      defaultStartingPrice: "10",
      rosterMax: "3",
      rosterMin: "2",
    });

    expect(saved).toMatchObject({
      bidIncrement: 5,
      budget: 100,
      defaultStartingPrice: 10,
      rosterMax: 3,
      rosterMin: 2,
    });
  });

  it("rejects an inverted Roster range", async () => {
    const organizerId = await createTestUser("rules-invalid");
    const auction = await createTestAuction(organizerId);

    await expect(
      saveSimpleRules(pool, organizerId, auction.id, {
        bidIncrement: 5,
        budget: 100,
        defaultStartingPrice: 10,
        rosterMax: 2,
        rosterMin: 3,
      }),
    ).rejects.toThrow();
  });

  it("refuses Tiered Rules, which arrive in a later step", async () => {
    const organizerId = await createTestUser("rules-tiered");
    const auction = await createTestAuction(organizerId, {
      rulesMode: "tiered",
    });

    await expect(
      saveSimpleRules(pool, organizerId, auction.id, {
        bidIncrement: 5,
        budget: 100,
        defaultStartingPrice: 10,
        rosterMax: 3,
        rosterMin: 2,
      }),
    ).rejects.toThrow(RuleSetupError);
  });
});

describe("readiness", () => {
  it("reports grouped errors for an incomplete Auction", async () => {
    const organizerId = await createTestUser("readiness-empty");
    const auction = await createTestAuction(organizerId);

    const report = await getReadinessForOrganizer(
      pool,
      organizerId,
      auction.id,
    );

    expect(report?.readiness.ready).toBe(false);
    const groups = report!.readiness.errors.map((issue) => issue.group);
    expect(groups).toContain("teams");
    expect(groups).toContain("rules");
  });

  it("promotes a complete Auction to Ready and returns it to Draft after an edit", async () => {
    const { auctionId, organizerId } =
      await buildReadyAuction("readiness-ready");

    const readiness = await syncAuctionReadiness(pool, organizerId, auctionId);
    expect(readiness?.ready).toBe(true);

    const status = await pool.query<{ status: string }>(
      `select "status" from "auction" where "id" = $1`,
      [auctionId],
    );
    expect(status.rows[0]!.status).toBe("ready");

    // A later setup edit invalidates Ready and returns the Auction to Draft.
    await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "Erin",
    });
    const afterEdit = await pool.query<{ status: string }>(
      `select "status" from "auction" where "id" = $1`,
      [auctionId],
    );
    expect(afterEdit.rows[0]!.status).toBe("draft");
  });
});

describe("startAuction", () => {
  it("refuses to start an Auction with unresolved Readiness errors", async () => {
    const organizerId = await createTestUser("start-unready");
    const auction = await createTestAuction(organizerId);

    await expect(startAuction(pool, organizerId, auction.id)).rejects.toThrow(
      AuctionStartError,
    );
  });

  it("freezes prices into the first immutable revision and moves to Live", async () => {
    const { auctionId, organizerId } = await buildReadyAuction("start");

    const started = await startAuction(pool, organizerId, auctionId);

    expect(started).toMatchObject({ auctionId, revision: 1 });
    expect(started?.disconnectedRepresentativeCount).toBe(2);

    const auction = await pool.query<{ revision: number; status: string }>(
      `select "status", "revision" from "auction" where "id" = $1`,
      [auctionId],
    );
    expect(auction.rows[0]).toEqual({ revision: 1, status: "live" });

    const revision = await pool.query<{
      payload: {
        players: { starting_price: number }[];
        rules: { budget: number };
      };
    }>(
      `select "payload" from "auction_revision" where "auction_id" = $1 and "revision" = 1`,
      [auctionId],
    );
    expect(revision.rows[0]!.payload.rules.budget).toBe(100);
    expect(
      revision.rows[0]!.payload.players.map((player) => player.starting_price),
    ).toEqual([10, 10, 10, 10]);
  });

  it("allows only one Live Auction across the service", async () => {
    const first = await buildReadyAuction("start-first");
    const second = await buildReadyAuction("start-second");

    await startAuction(pool, first.organizerId, first.auctionId);

    await expect(
      startAuction(pool, second.organizerId, second.auctionId),
    ).rejects.toThrow(/one Live Auction/);
  });

  it("returns null for a stale Auction that is no longer editable", async () => {
    const { auctionId, organizerId } = await buildReadyAuction("start-stale");
    await pool.query(
      `update "auction" set "status" = 'completed' where "id" = $1`,
      [auctionId],
    );

    expect(await startAuction(pool, organizerId, auctionId)).toBeNull();
  });
});
