import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { placeBid } from "@/server/auction-command/place-bid";
import { selectPlayer } from "@/server/auction-command/select-player";
import { getLiveSnapshot } from "@/server/auction-query/live-snapshot";
import { getLiveRevision } from "@/server/auction-query/live-revision";
import { CoalescingRealtimeDistributor } from "@/server/realtime/distributor";
import {
  grantRealtimeAccess,
  auctionBroadcastTopic,
  verifyRealtimeGrant,
} from "@/server/realtime/grant";
import {
  publishPendingOutbox,
  readPendingOutbox,
} from "@/server/realtime/outbox";
import {
  cleanupTestUsers,
  createTestUser,
  pool,
  resetLiveAuctions,
} from "./support";
import { buildLiveAuction, type LiveFixture } from "./live-support";

afterAll(cleanupTestUsers);

beforeEach(resetLiveAuctions);
afterEach(resetLiveAuctions);

function commandId(): string {
  return randomUUID();
}

async function revision(auctionId: string): Promise<number> {
  const result = await pool.query<{ revision: number }>(
    `select "revision" from "auction" where "id" = $1`,
    [auctionId],
  );
  return result.rows[0]!.revision;
}

async function present(fixture: LiveFixture, index = 0): Promise<string> {
  const outcome = await selectPlayer(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
    playerEntryId: fixture.players[index]!.id,
    selectionMethod: "manual",
  });
  if (outcome.status !== "accepted") {
    throw new Error(`selection failed: ${JSON.stringify(outcome)}`);
  }
  return outcome.result.presentationId;
}

describe("getLiveSnapshot", () => {
  it("gives the Organizer full public state and its own private role", async () => {
    const fixture = await buildLiveAuction("snapshot-organizer");
    await present(fixture);

    const access = await getLiveSnapshot(
      pool,
      fixture.organizerId,
      fixture.auctionId,
    );

    expect(access?.role).toBe("organizer");
    expect(access!.snapshot.teams).toHaveLength(2);
    expect(access!.snapshot.activePlayer?.displayName).toBe("Player 1");
    expect(access!.snapshot.nextBidAmount).toBe(10);
    expect(access!.snapshot.you.role).toBe("organizer");
    expect(access!.snapshot.you.teamId).toBeNull();
    expect(JSON.parse(JSON.stringify(access!.snapshot))).toEqual(
      access!.snapshot,
    );
  });

  it("gives a Representative only its own Team's private details", async () => {
    const fixture = await buildLiveAuction("snapshot-representative");

    const access = await getLiveSnapshot(
      pool,
      fixture.redsRepUserId,
      fixture.auctionId,
    );

    expect(access?.role).toBe("representative");
    expect(access!.teamId).toBe(fixture.redsTeamId);
    expect(access!.snapshot.you.role).toBe("representative");
    expect(access!.snapshot.you.teamId).toBe(fixture.redsTeamId);
    expect(access!.snapshot.you.remainingBudget).toBe(100);
  });

  it("returns nothing to an unrelated User", async () => {
    const fixture = await buildLiveAuction("snapshot-unrelated");
    const strangerId = await createTestUser("snapshot-stranger");

    expect(
      await getLiveSnapshot(pool, strangerId, fixture.auctionId),
    ).toBeNull();
  });

  it("returns nothing once the Auction is no longer Live or Paused", async () => {
    const fixture = await buildLiveAuction("snapshot-not-live");
    await pool.query(
      `update "auction" set "status" = 'completed' where "id" = $1`,
      [fixture.auctionId],
    );

    expect(
      await getLiveSnapshot(pool, fixture.organizerId, fixture.auctionId),
    ).toBeNull();
  });

  it("hides a rejected Bid from another Team but shows it to the Organizer and submitter", async () => {
    const fixture = await buildLiveAuction("snapshot-rejection");
    const presentationId = await present(fixture);
    const beforeRejection = await revision(fixture.auctionId);
    const outcome = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 5,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });
    expect(outcome).toMatchObject({
      status: "rejected",
      reason: "wrong_amount",
    });
    expect(await revision(fixture.auctionId)).toBe(beforeRejection);

    const reds = await getLiveSnapshot(
      pool,
      fixture.redsRepUserId,
      fixture.auctionId,
    );
    const blues = await getLiveSnapshot(
      pool,
      fixture.bluesRepUserId,
      fixture.auctionId,
    );
    const organizer = await getLiveSnapshot(
      pool,
      fixture.organizerId,
      fixture.auctionId,
    );

    expect(reds!.snapshot.rejections.map((entry) => entry.reason)).toContain(
      "wrong_amount",
    );
    expect(blues!.snapshot.rejections).toHaveLength(0);
    expect(
      organizer!.snapshot.rejections.map((entry) => entry.reason),
    ).toContain("wrong_amount");
  });
});

describe("getLiveRevision", () => {
  it("allows the Organizer and current Representatives while Live or Paused", async () => {
    const fixture = await buildLiveAuction("revision-access");
    const organizer = await getLiveRevision(
      pool,
      fixture.organizerId,
      fixture.auctionId,
    );
    const representative = await getLiveRevision(
      pool,
      fixture.redsRepUserId,
      fixture.auctionId,
    );
    expect(organizer?.revision).toBe(1);
    expect(representative?.revision).toBe(1);
    expect(Number.isFinite(Date.parse(organizer!.serverTime))).toBe(true);

    await pool.query(
      `update "auction" set "status" = 'paused' where "id" = $1`,
      [fixture.auctionId],
    );
    expect(
      await getLiveRevision(pool, fixture.redsRepUserId, fixture.auctionId),
    ).not.toBeNull();
  });

  it("hides unrelated, replaced, hidden, and non-Live Auctions", async () => {
    const fixture = await buildLiveAuction("revision-denied");
    const strangerId = await createTestUser("revision-stranger");
    expect(
      await getLiveRevision(pool, strangerId, fixture.auctionId),
    ).toBeNull();

    await pool.query(
      `update "team" set "representative_user_id" = $2 where "id" = $1`,
      [fixture.redsTeamId, strangerId],
    );
    expect(
      await getLiveRevision(pool, fixture.redsRepUserId, fixture.auctionId),
    ).toBeNull();
    expect(
      await getLiveRevision(pool, strangerId, fixture.auctionId),
    ).not.toBeNull();

    await pool.query(
      `update "auction" set "hidden_at" = now(), "hidden_reason" = 'test' where "id" = $1`,
      [fixture.auctionId],
    );
    expect(
      await getLiveRevision(pool, fixture.organizerId, fixture.auctionId),
    ).toBeNull();
    await pool.query(
      `update "auction" set "hidden_at" = null, "hidden_reason" = null, "status" = 'completed' where "id" = $1`,
      [fixture.auctionId],
    );
    expect(
      await getLiveRevision(pool, fixture.organizerId, fixture.auctionId),
    ).toBeNull();
    expect(
      await getLiveRevision(pool, fixture.organizerId, randomUUID()),
    ).toBeNull();
  });
});

describe("Realtime grants", () => {
  it("issues short-lived grants only to Auction participants", async () => {
    const fixture = await buildLiveAuction("grant-membership");
    const strangerId = await createTestUser("grant-stranger");

    expect(
      await grantRealtimeAccess(pool, strangerId, fixture.auctionId),
    ).toBeNull();

    const organizerGrant = await grantRealtimeAccess(
      pool,
      fixture.organizerId,
      fixture.auctionId,
    );
    expect(organizerGrant?.channel).toBe(
      auctionBroadcastTopic(fixture.auctionId),
    );
    expect(
      verifyRealtimeGrant({
        auctionId: fixture.auctionId,
        expiresAt: organizerGrant!.expiresAt,
        token: organizerGrant!.token,
        userId: fixture.organizerId,
      }),
    ).toBe(true);

    const repGrant = await grantRealtimeAccess(
      pool,
      fixture.bluesRepUserId,
      fixture.auctionId,
    );
    expect(repGrant).not.toBeNull();
    expect(
      verifyRealtimeGrant({
        auctionId: fixture.auctionId,
        expiresAt: repGrant!.expiresAt,
        token: repGrant!.token,
        userId: fixture.bluesRepUserId,
      }),
    ).toBe(true);
  });

  it("rejects an expired grant and a grant reused for another User", async () => {
    const fixture = await buildLiveAuction("grant-verify");
    const grant = await grantRealtimeAccess(
      pool,
      fixture.organizerId,
      fixture.auctionId,
    );

    expect(
      verifyRealtimeGrant({
        auctionId: fixture.auctionId,
        expiresAt: grant!.expiresAt,
        now: new Date(new Date(grant!.expiresAt).getTime() + 1000),
        token: grant!.token,
        userId: fixture.organizerId,
      }),
    ).toBe(false);

    expect(
      verifyRealtimeGrant({
        auctionId: fixture.auctionId,
        expiresAt: grant!.expiresAt,
        token: grant!.token,
        userId: fixture.bluesRepUserId,
      }),
    ).toBe(false);
  });

  it("denies a former Representative after replacement", async () => {
    const fixture = await buildLiveAuction("grant-revoked");
    const replacementId = await createTestUser("grant-replacement");
    await pool.query(
      `update "team" set "representative_user_id" = $2 where "id" = $1`,
      [fixture.redsTeamId, replacementId],
    );

    expect(
      await grantRealtimeAccess(pool, fixture.redsRepUserId, fixture.auctionId),
    ).toBeNull();
    expect(
      await getLiveSnapshot(pool, fixture.redsRepUserId, fixture.auctionId),
    ).toBeNull();
  });
});

describe("outbox and revisions", () => {
  it("records one outbox event per committed change and drains it", async () => {
    const fixture = await buildLiveAuction("outbox-drain");
    await present(fixture);

    const pending = await readPendingOutbox(pool, fixture.auctionId);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.kind).toBe("player_presented");
    expect(pending[0]!.revision).toBe(2);

    const sent: number[] = [];
    const distributor = new CoalescingRealtimeDistributor({
      send: (event) => {
        sent.push(event.revision);
      },
    });
    const drained = await publishPendingOutbox(
      pool,
      fixture.auctionId,
      distributor,
    );
    expect(drained).toBe(1);
    expect(sent).toEqual([2]);
    expect(await readPendingOutbox(pool, fixture.auctionId)).toHaveLength(0);
  });

  it("keeps the Auction revision monotonic across commands", async () => {
    const fixture = await buildLiveAuction("outbox-monotonic");
    const presentationId = await present(fixture);
    await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });

    const revisions = await pool.query<{ revision: number }>(
      `select "revision" from "auction_outbox_event"
        where "auction_id" = $1 order by "id" asc`,
      [fixture.auctionId],
    );
    const values = revisions.rows.map((row) => row.revision);
    expect(values).toEqual([2, 3]);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]!).toBeGreaterThan(values[index - 1]!);
    }
  });
});
