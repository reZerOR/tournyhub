import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { finalizePresentation } from "@/server/auction-command/close-player";
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

async function databaseNow(): Promise<number> {
  const result = await pool.query<{ now: Date }>(`select now() as now`);
  return result.rows[0]!.now.getTime();
}

async function presentTimed(
  fixture: LiveFixture,
  index = 0,
): Promise<{ closeDeadline: null | string; presentationId: string }> {
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
  return {
    closeDeadline: outcome.result.closeDeadline,
    presentationId: outcome.result.presentationId,
  };
}

/** Moves the stored close deadline without waiting for real time to pass. */
async function setCloseDeadline(
  presentationId: string,
  seconds: number,
): Promise<void> {
  await pool.query(
    `update "player_presentation"
        set "close_deadline" = now() + ($2 || ' seconds')::interval
      where "id" = $1`,
    [presentationId, String(seconds)],
  );
}

describe("Timed Close", () => {
  it("stores a database deadline from the configured duration", async () => {
    const fixture = await buildLiveAuction("timed-deadline", {
      closeMode: "timed",
    });
    const before = await databaseNow();
    const { closeDeadline, presentationId } = await presentTimed(fixture);

    expect(closeDeadline).not.toBeNull();
    expect(new Date(closeDeadline!).getTime() - before).toBeGreaterThan(25_000);
    expect(new Date(closeDeadline!).getTime() - before).toBeLessThanOrEqual(
      31_000,
    );

    const stored = await pool.query<{ close_deadline: Date | null }>(
      `select "close_deadline" from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    expect(stored.rows[0]!.close_deadline).not.toBeNull();
  });

  it("honours a configured duration other than the 30-second default", async () => {
    const fixture = await buildLiveAuction("timed-custom", {
      closeMode: "timed",
      timedCloseSeconds: 600,
    });
    const before = await databaseNow();
    const { closeDeadline } = await presentTimed(fixture);

    expect(new Date(closeDeadline!).getTime() - before).toBeGreaterThan(
      595_000,
    );
  });

  it("moves the deadline to five seconds when a Bid arrives in the final seconds", async () => {
    const fixture = await buildLiveAuction("timed-anti-snipe", {
      closeMode: "timed",
    });
    const { presentationId } = await presentTimed(fixture);
    await setCloseDeadline(presentationId, 2);

    const outcome = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });
    expect(outcome.status).toBe("accepted");

    const after = await databaseNow();
    const stored = await pool.query<{ close_deadline: Date }>(
      `select "close_deadline" from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    const remaining = stored.rows[0]!.close_deadline.getTime() - after;
    expect(remaining).toBeGreaterThan(3_000);
    expect(remaining).toBeLessThanOrEqual(6_000);
  });

  it("leaves the deadline alone when a Bid arrives well before the final seconds", async () => {
    const fixture = await buildLiveAuction("timed-no-snipe", {
      closeMode: "timed",
      timedCloseSeconds: 120,
    });
    const { closeDeadline, presentationId } = await presentTimed(fixture);

    await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });

    const stored = await pool.query<{ close_deadline: Date }>(
      `select "close_deadline" from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    expect(stored.rows[0]!.close_deadline.toISOString()).toBe(closeDeadline);
  });

  it("rejects a Bid after the authoritative deadline", async () => {
    const fixture = await buildLiveAuction("timed-late-bid", {
      closeMode: "timed",
    });
    const { presentationId } = await presentTimed(fixture);
    await setCloseDeadline(presentationId, -1);

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
      reason: "deadline_passed",
      status: "rejected",
    });
  });

  it("refuses to finalize before the deadline and then sells the leader once", async () => {
    const fixture = await buildLiveAuction("timed-finalize", {
      closeMode: "timed",
    });
    const { presentationId } = await presentTimed(fixture);
    await placeBid(pool, {
      actorUserId: fixture.bluesRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.bluesTeamId,
    });

    const early = await finalizePresentation(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      presentationId,
    });
    expect(early).toMatchObject({ reason: "too_early", status: "rejected" });

    await setCloseDeadline(presentationId, -1);
    const sold = await finalizePresentation(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      presentationId,
    });

    expect(sold.status).toBe("accepted");
    if (sold.status !== "accepted") return;
    expect(sold.result).toMatchObject({
      kind: "sold",
      teamId: fixture.bluesTeamId,
    });

    const sale = await pool.query<{ amount: number; team_id: string }>(
      `select "amount", "team_id" from "sale" where "presentation_id" = $1`,
      [presentationId],
    );
    expect(sale.rows[0]).toMatchObject({
      amount: 10,
      team_id: fixture.bluesTeamId,
    });

    const cleared = await pool.query<{ close_deadline: Date | null }>(
      `select "close_deadline" from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    expect(cleared.rows[0]!.close_deadline).toBeNull();
  });

  it("marks an unbid Timed Close Player Unsold in the Unsold Pool", async () => {
    const fixture = await buildLiveAuction("timed-unsold", {
      closeMode: "timed",
    });
    const { presentationId } = await presentTimed(fixture);
    await setCloseDeadline(presentationId, -1);

    const outcome = await finalizePresentation(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      presentationId,
    });

    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") return;
    expect(outcome.result).toEqual({ kind: "unsold" });

    const membership = await pool.query<{ count: number }>(
      `select count(*)::int as count from "unsold_membership"
        where "presentation_id" = $1 and "resolved_at" is null`,
      [presentationId],
    );
    expect(membership.rows[0]!.count).toBe(1);
  });

  it("finalizes an expired Presentation from a wake-up request without a Presentation id", async () => {
    const fixture = await buildLiveAuction("timed-wakeup", {
      closeMode: "timed",
    });
    const { presentationId } = await presentTimed(fixture);

    const early = await finalizePresentation(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
    });
    expect(early).toMatchObject({ reason: "too_early", status: "rejected" });

    await setCloseDeadline(presentationId, -1);
    const outcome = await finalizePresentation(pool, {
      actorUserId: fixture.bluesRepUserId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
    });
    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") return;
    expect(outcome.result).toEqual({ kind: "unsold" });
  });

  it("produces one outcome for duplicate and competing finalizers at the deadline", async () => {
    const fixture = await buildLiveAuction("timed-finalizer-race", {
      closeMode: "timed",
    });
    const { presentationId } = await presentTimed(fixture);
    await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });
    await setCloseDeadline(presentationId, -1);

    const [first, second] = await Promise.all([
      finalizePresentation(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        presentationId,
      }),
      finalizePresentation(pool, {
        actorUserId: fixture.bluesRepUserId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
      }),
    ]);

    expect([first.status, second.status].sort()).toEqual([
      "accepted",
      "replayed",
    ]);
    const sales = await pool.query<{ count: number }>(
      `select count(*)::int from "sale" where "presentation_id" = $1`,
      [presentationId],
    );
    expect(sales.rows[0]!.count).toBe(1);
    const presentations = await pool.query<{ count: number; state: string }>(
      `select count(*)::int as count, min("state") as state
         from "player_presentation" where "auction_id" = $1`,
      [fixture.auctionId],
    );
    expect(presentations.rows[0]).toMatchObject({ count: 1, state: "sold" });
  });

  it("lets exactly one of an expired Bid and the finalizer win", async () => {
    const fixture = await buildLiveAuction("timed-bid-finalizer-race", {
      closeMode: "timed",
    });
    const { presentationId } = await presentTimed(fixture);
    await setCloseDeadline(presentationId, -1);
    const expected = await revision(fixture.auctionId);

    const [bid, finalized] = await Promise.all([
      placeBid(pool, {
        actorUserId: fixture.redsRepUserId,
        amount: 10,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: expected,
        presentationId,
        teamId: fixture.redsTeamId,
      }),
      finalizePresentation(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        presentationId,
      }),
    ]);

    if (bid.status === "accepted") {
      // A Bid could only be accepted before the deadline, so the finalizer
      // either refused an early call or replayed the same Presentation.
      expect(finalized.status).toBe("rejected");
    } else {
      // The finalizer won the lock, so the Bid is rejected either because the
      // deadline has passed or because the finalizer advanced the revision.
      expect(bid.status).toBe("rejected");
      expect(["deadline_passed", "stale_revision"]).toContain(
        (bid as { reason: string }).reason,
      );
      expect(finalized.status).toBe("accepted");
    }
  });
});
