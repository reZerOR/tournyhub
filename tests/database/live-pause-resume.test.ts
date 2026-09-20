import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { beginManualClose } from "@/server/auction-command/close-player";
import {
  pauseAuction,
  resumeAuction,
} from "@/server/auction-command/lifecycle";
import { placeBid } from "@/server/auction-command/place-bid";
import { selectPlayer } from "@/server/auction-command/select-player";
import { cleanupTestUsers, pool, resetLiveAuctions } from "./support";
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

async function status(auctionId: string): Promise<string> {
  const result = await pool.query<{ status: string }>(
    `select "status" from "auction" where "id" = $1`,
    [auctionId],
  );
  return result.rows[0]!.status;
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

describe("pauseAuction", () => {
  it("rejects a non-Organizer and a non-Live Auction", async () => {
    const fixture = await buildLiveAuction("pause-authority");

    const forged = await pauseAuction(pool, {
      actorUserId: fixture.redsRepUserId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    expect(forged.status).toBe("unauthorized");

    await pool.query(
      `update "auction" set "status" = 'draft' where "id" = $1`,
      [fixture.auctionId],
    );
    const notLive = await pauseAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    expect(notLive).toMatchObject({
      reason: "auction_not_live",
      status: "rejected",
    });
  });

  it("preserves the Active Player, the leader, and the remaining duration", async () => {
    const fixture = await buildLiveAuction("pause-preserve", {
      closeMode: "timed",
    });
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
    await pool.query(
      `update "player_presentation"
          set "close_deadline" = now() + interval '20 seconds'
        where "id" = $1`,
      [presentationId],
    );

    const outcome = await pauseAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    expect(outcome.status).toBe("accepted");
    expect(await status(fixture.auctionId)).toBe("paused");

    const parked = await pool.query<{
      close_deadline: Date | null;
      paused_remaining_ms: number | null;
      paused_state: string | null;
      state: string;
    }>(
      `select "state", "close_deadline", "paused_state", "paused_remaining_ms"
         from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    expect(parked.rows[0]).toMatchObject({
      close_deadline: null,
      paused_state: "open",
      state: "open",
    });
    expect(parked.rows[0]!.paused_remaining_ms).toBeGreaterThan(18_000);
    expect(parked.rows[0]!.paused_remaining_ms).toBeLessThanOrEqual(20_000);

    const leader = await pool.query<{ amount: number; team_id: string }>(
      `select "amount", "team_id" from "bid_attempt"
        where "presentation_id" = $1 and "status" = 'accepted'`,
      [presentationId],
    );
    expect(leader.rows[0]).toMatchObject({
      amount: 10,
      team_id: fixture.redsTeamId,
    });

    const audit = await pool.query<{ count: number }>(
      `select count(*)::int as count from "audit_entry"
        where "auction_id" = $1 and "action" = 'pause_auction'`,
      [fixture.auctionId],
    );
    expect(audit.rows[0]!.count).toBe(1);
  });

  it("rejects a Bid while Paused and resumes from the stored remaining duration", async () => {
    const fixture = await buildLiveAuction("pause-resume", {
      closeMode: "timed",
    });
    const presentationId = await present(fixture);
    await pauseAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });

    const blocked = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });
    expect(blocked).toMatchObject({
      reason: "auction_paused",
      status: "rejected",
    });

    const resumed = await resumeAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    expect(resumed.status).toBe("accepted");
    expect(await status(fixture.auctionId)).toBe("live");

    const restored = await pool.query<{ close_deadline: Date }>(
      `select "close_deadline" from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    const now = await pool.query<{ now: Date }>(`select now() as now`);
    const remaining =
      restored.rows[0]!.close_deadline.getTime() - now.rows[0]!.now.getTime();
    expect(remaining).toBeGreaterThan(20_000);
    expect(remaining).toBeLessThanOrEqual(30_000);
  });

  it("parks and restores a Manual Close warning", async () => {
    const fixture = await buildLiveAuction("pause-manual-warning");
    const presentationId = await present(fixture);
    await beginManualClose(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
    });

    await pauseAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    const parked = await pool.query<{
      paused_state: string | null;
      state: string;
      warning_deadline: Date | null;
    }>(
      `select "state", "warning_deadline", "paused_state"
         from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    expect(parked.rows[0]).toMatchObject({
      paused_state: "closing",
      state: "open",
      warning_deadline: null,
    });

    await resumeAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    const restored = await pool.query<{
      paused_state: string | null;
      state: string;
      warning_deadline: Date | null;
    }>(
      `select "state", "warning_deadline", "paused_state"
         from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    expect(restored.rows[0]).toMatchObject({
      paused_state: null,
      state: "closing",
    });
    expect(restored.rows[0]!.warning_deadline).not.toBeNull();
  });

  it("keeps one Active Player across repeated pause and resume", async () => {
    const fixture = await buildLiveAuction("pause-repeat");
    const presentationId = await present(fixture);

    for (let round = 0; round < 3; round += 1) {
      const paused = await pauseAuction(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
      });
      expect(paused.status).toBe("accepted");
      const resumed = await resumeAuction(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
      });
      expect(resumed.status).toBe("accepted");
    }

    const presentations = await pool.query<{ count: number }>(
      `select count(*)::int as count from "player_presentation"
        where "auction_id" = $1 and "state" in ('open', 'closing')`,
      [fixture.auctionId],
    );
    expect(presentations.rows[0]!.count).toBe(1);
    const active = await pool.query<{ id: string }>(
      `select "id" from "player_presentation"
        where "auction_id" = $1 and "state" in ('open', 'closing')`,
      [fixture.auctionId],
    );
    expect(active.rows[0]!.id).toBe(presentationId);
  });

  it("refuses to resume a Live Auction and a stale pause", async () => {
    const fixture = await buildLiveAuction("pause-stale");
    const stale = await revision(fixture.auctionId);
    await present(fixture);

    const notPaused = await resumeAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    expect(notPaused).toMatchObject({
      reason: "not_paused",
      status: "rejected",
    });

    const rejected = await pauseAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: stale,
    });
    expect(rejected).toMatchObject({
      reason: "stale_revision",
      status: "rejected",
    });
  });

  it("serializes a pause racing an in-flight Bid", async () => {
    const fixture = await buildLiveAuction("pause-bid-race");
    const presentationId = await present(fixture);
    const expected = await revision(fixture.auctionId);

    const [paused, bid] = await Promise.all([
      pauseAuction(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: expected,
      }),
      placeBid(pool, {
        actorUserId: fixture.redsRepUserId,
        amount: 10,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: expected,
        presentationId,
        teamId: fixture.redsTeamId,
      }),
    ]);

    const accepted = [paused.status, bid.status].filter(
      (value) => value === "accepted",
    );
    expect(accepted).toHaveLength(1);

    if (paused.status === "accepted") {
      expect(bid).toMatchObject({ reason: "auction_paused" });
      expect(await status(fixture.auctionId)).toBe("paused");
    } else {
      expect(bid.status).toBe("accepted");
      expect(paused).toMatchObject({ reason: "stale_revision" });
    }

    // The lock produced exactly one legal outcome: a Bid exists only if the
    // Bid won the race.
    const acceptedBids = await pool.query<{ count: number }>(
      `select count(*)::int as count from "bid_attempt"
        where "presentation_id" = $1 and "status" = 'accepted'`,
      [presentationId],
    );
    expect(acceptedBids.rows[0]!.count).toBe(bid.status === "accepted" ? 1 : 0);
  });

  it("removes command authority from a replaced representative", async () => {
    const fixture = await buildLiveAuction("pause-revoked");
    const presentationId = await present(fixture);
    await pool.query(
      `update "team" set "representative_user_id" = null where "id" = $1`,
      [fixture.redsTeamId],
    );

    const outcome = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });

    expect(outcome).toMatchObject({
      reason: "not_representative",
      status: "rejected",
    });
  });

  it("replays a repeated pause command without a second revision", async () => {
    const fixture = await buildLiveAuction("pause-idempotent");
    const id = commandId();
    const expected = await revision(fixture.auctionId);

    const first = await pauseAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: expected,
    });
    const second = await pauseAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: expected,
    });

    expect(first.status).toBe("accepted");
    expect(second.status).toBe("replayed");
    expect(await revision(fixture.auctionId)).toBe(expected + 1);
  });
});
