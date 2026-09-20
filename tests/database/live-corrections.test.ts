import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  beginManualClose,
  finalizePresentation,
} from "@/server/auction-command/close-player";
import {
  cancelHighestBid,
  reverseSale,
} from "@/server/auction-command/corrections";
import {
  pauseAuction,
  resumeAuction,
} from "@/server/auction-command/lifecycle";
import { placeBid } from "@/server/auction-command/place-bid";
import { selectPlayer } from "@/server/auction-command/select-player";
import { getLiveSnapshot } from "@/server/auction-query/live-snapshot";
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

async function pause(fixture: LiveFixture): Promise<void> {
  const outcome = await pauseAuction(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
  });
  if (outcome.status !== "accepted") {
    throw new Error(`pause failed: ${JSON.stringify(outcome)}`);
  }
}

/** Sells the first Player to a Team and returns the Sale id. */
async function sellFirstPlayer(fixture: LiveFixture): Promise<string> {
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
  await beginManualClose(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
    presentationId,
  });
  await pool.query(
    `update "player_presentation"
        set "warning_deadline" = now() - interval '1 second'
      where "id" = $1`,
    [presentationId],
  );
  const outcome = await finalizePresentation(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    presentationId,
  });
  if (outcome.status !== "accepted" || outcome.result.kind !== "sold") {
    throw new Error(`sale failed: ${JSON.stringify(outcome)}`);
  }
  return outcome.result.saleId;
}

describe("cancelHighestBid", () => {
  it("is allowed only for the Organizer and only while Paused", async () => {
    const fixture = await buildLiveAuction("cancel-guards");
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

    const forged = await cancelHighestBid(pool, {
      actorUserId: fixture.redsRepUserId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      reason: "Try it",
    });
    expect(forged.status).toBe("unauthorized");

    const live = await cancelHighestBid(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      reason: "Wrong price",
    });
    expect(live).toMatchObject({ reason: "auction_not_paused" });

    await pause(fixture);
    const noReason = await cancelHighestBid(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      reason: "   ",
    });
    expect(noReason).toMatchObject({ reason: "reason_required" });
  });

  it("restores the preceding valid Bid and keeps every attempt inspectable", async () => {
    const fixture = await buildLiveAuction("cancel-restore");
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
    await placeBid(pool, {
      actorUserId: fixture.bluesRepUserId,
      amount: 15,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.bluesTeamId,
    });
    await pause(fixture);

    const before = await revision(fixture.auctionId);
    const outcome = await cancelHighestBid(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: before,
      presentationId,
      reason: "Bid submitted by mistake",
    });

    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") return;
    expect(outcome.result).toMatchObject({
      cancelledAmount: 15,
      cancelledTeamId: fixture.bluesTeamId,
      restoredAmount: 10,
      restoredTeamId: fixture.redsTeamId,
    });
    expect(await revision(fixture.auctionId)).toBe(before + 1);

    // The cancelled attempt keeps its amount, Team, and server time.
    const attempts = await pool.query<{
      amount: number;
      cancelled_at: Date | null;
      reason: null | string;
      status: string;
      team_id: string;
    }>(
      `select "amount", "team_id", "status", "reason", "cancelled_at"
         from "bid_attempt" where "presentation_id" = $1
        order by "amount" asc`,
      [presentationId],
    );
    expect(attempts.rows).toHaveLength(2);
    expect(attempts.rows[0]).toMatchObject({
      amount: 10,
      status: "accepted",
      team_id: fixture.redsTeamId,
    });
    expect(attempts.rows[1]).toMatchObject({
      amount: 15,
      reason: "Bid submitted by mistake",
      status: "cancelled",
      team_id: fixture.bluesTeamId,
    });
    expect(attempts.rows[1]!.cancelled_at).not.toBeNull();

    const snapshot = await getLiveSnapshot(
      pool,
      fixture.organizerId,
      fixture.auctionId,
    );
    expect(snapshot!.snapshot.currentBid).toMatchObject({
      amount: 10,
      teamId: fixture.redsTeamId,
    });
    expect(snapshot!.snapshot.nextBidAmount).toBe(15);

    const audit = await pool.query<{ reason: string }>(
      `select "reason" from "audit_entry"
        where "auction_id" = $1 and "action" = 'cancel_bid'`,
      [fixture.auctionId],
    );
    expect(audit.rows[0]!.reason).toBe("Bid submitted by mistake");
  });

  it("returns the Player to its Starting Price when no Bid remains", async () => {
    const fixture = await buildLiveAuction("cancel-starting-price");
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
    await pause(fixture);

    const outcome = await cancelHighestBid(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      reason: "Only Bid was wrong",
    });

    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") return;
    expect(outcome.result.restoredAmount).toBeNull();

    const snapshot = await getLiveSnapshot(
      pool,
      fixture.organizerId,
      fixture.auctionId,
    );
    expect(snapshot!.snapshot.currentBid).toBeNull();
    expect(snapshot!.snapshot.nextBidAmount).toBe(10);
  });

  it("refuses when there is no accepted Bid", async () => {
    const fixture = await buildLiveAuction("cancel-no-bid");
    const presentationId = await present(fixture);
    await pause(fixture);

    const outcome = await cancelHighestBid(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      reason: "Nothing to cancel",
    });

    expect(outcome).toMatchObject({ reason: "no_bid", status: "rejected" });
  });

  it("rejects a correction that would leave no Legal Completion", async () => {
    const fixture = await buildLiveAuction("cancel-infeasible");
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
    await pause(fixture);
    // Leave only the Active Player as supply, so no Team can reach its minimum.
    // The command layer cannot reach this state: this exercises the guard.
    await pool.query(
      `delete from "player_entry"
        where "auction_id" = $1 and "id" = any($2::uuid[])`,
      [fixture.auctionId, fixture.players.slice(1).map((player) => player.id)],
    );

    const outcome = await cancelHighestBid(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      reason: "Try it",
    });

    expect(outcome).toMatchObject({
      reason: "no_legal_completion",
      status: "rejected",
    });
  });

  it("replays a duplicate cancel command and serializes competing ones", async () => {
    const fixture = await buildLiveAuction("cancel-race");
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
    await pause(fixture);
    const expected = await revision(fixture.auctionId);
    const id = commandId();

    const first = await cancelHighestBid(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: expected,
      presentationId,
      reason: "Duplicate",
    });
    const replayed = await cancelHighestBid(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: expected,
      presentationId,
      reason: "Duplicate",
    });
    expect(first.status).toBe("accepted");
    expect(replayed.status).toBe("replayed");

    const [left, right] = await Promise.all([
      cancelHighestBid(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        presentationId,
        reason: "Race one",
      }),
      cancelHighestBid(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        presentationId,
        reason: "Race two",
      }),
    ]);
    expect(left.status).toBe("rejected");
    expect(right.status).toBe("rejected");
    expect([left, right].map((outcome) => outcome.status)).not.toContain(
      "accepted",
    );

    const audits = await pool.query<{ count: number }>(
      `select count(*)::int as count from "audit_entry"
        where "auction_id" = $1 and "action" = 'cancel_bid'`,
      [fixture.auctionId],
    );
    expect(audits.rows[0]!.count).toBe(1);
  });
});

describe("reverseSale", () => {
  it("refunds the Team, removes the Roster entry, and returns the Player to the Unsold Pool", async () => {
    const fixture = await buildLiveAuction("reverse-sale");
    const saleId = await sellFirstPlayer(fixture);
    await pause(fixture);

    const before = await revision(fixture.auctionId);
    const outcome = await reverseSale(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: before,
      reason: "Wrong Team won",
      saleId,
    });

    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") return;
    expect(outcome.result).toMatchObject({
      amount: 10,
      teamId: fixture.redsTeamId,
    });
    expect(await revision(fixture.auctionId)).toBe(before + 1);

    // The original Sale stays in place and gains a compensating record.
    const sale = await pool.query<{
      reversed_at: Date | null;
      reversed_by_user_id: null | string;
      reversed_reason: null | string;
    }>(
      `select "reversed_at", "reversed_reason", "reversed_by_user_id"
         from "sale" where "id" = $1`,
      [saleId],
    );
    expect(sale.rows[0]).toMatchObject({
      reversed_by_user_id: fixture.organizerId,
      reversed_reason: "Wrong Team won",
    });
    expect(sale.rows[0]!.reversed_at).not.toBeNull();

    const reversal = await pool.query<{ amount: number; reason: string }>(
      `select "amount", "reason" from "sale_reversal" where "sale_id" = $1`,
      [saleId],
    );
    expect(reversal.rows[0]).toMatchObject({
      amount: 10,
      reason: "Wrong Team won",
    });

    // The Player is back in the Unsold Pool and the Team's Roster shrank.
    const membership = await pool.query<{ count: number }>(
      `select count(*)::int as count from "unsold_membership"
        where "auction_id" = $1 and "player_entry_id" = $2
          and "resolved_at" is null`,
      [fixture.auctionId, fixture.players[0]!.id],
    );
    expect(membership.rows[0]!.count).toBe(1);

    const snapshot = await getLiveSnapshot(
      pool,
      fixture.redsRepUserId,
      fixture.auctionId,
    );
    expect(snapshot!.snapshot.you.rosterCount).toBe(1);
    expect(snapshot!.snapshot.you.spentCredits).toBe(0);
    expect(snapshot!.snapshot.you.remainingBudget).toBe(100);

    const audit = await pool.query<{ reason: string }>(
      `select "reason" from "audit_entry"
        where "auction_id" = $1 and "action" = 'reverse_sale'`,
      [fixture.auctionId],
    );
    expect(audit.rows[0]!.reason).toBe("Wrong Team won");
  });

  it("is allowed only while Paused and only for the Organizer", async () => {
    const fixture = await buildLiveAuction("reverse-guards");
    const saleId = await sellFirstPlayer(fixture);

    const live = await reverseSale(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      reason: "Too early",
      saleId,
    });
    expect(live).toMatchObject({ reason: "auction_not_paused" });

    await pause(fixture);
    expect(
      (
        await reverseSale(pool, {
          actorUserId: fixture.redsRepUserId,
          auctionId: fixture.auctionId,
          commandId: commandId(),
          expectedRevision: await revision(fixture.auctionId),
          reason: "Not mine to reverse",
          saleId,
        })
      ).status,
    ).toBe("unauthorized");

    expect(
      await reverseSale(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        reason: "Unknown sale",
        saleId: randomUUID(),
      }),
    ).toMatchObject({ reason: "sale_missing" });
  });

  it("refuses an already reversed Sale and replays a duplicate command", async () => {
    const fixture = await buildLiveAuction("reverse-idempotent");
    const saleId = await sellFirstPlayer(fixture);
    await pause(fixture);
    const expected = await revision(fixture.auctionId);
    const id = commandId();

    const first = await reverseSale(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: expected,
      reason: "First reversal",
      saleId,
    });
    const replayed = await reverseSale(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: expected,
      reason: "First reversal",
      saleId,
    });
    expect(first.status).toBe("accepted");
    expect(replayed.status).toBe("replayed");

    const again = await reverseSale(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      reason: "Again",
      saleId,
    });
    expect(again).toMatchObject({
      reason: "already_reversed",
      status: "rejected",
    });

    const reversals = await pool.query<{ count: number }>(
      `select count(*)::int as count from "sale_reversal" where "sale_id" = $1`,
      [saleId],
    );
    expect(reversals.rows[0]!.count).toBe(1);
  });

  it("serializes competing reversals without a duplicate refund", async () => {
    const fixture = await buildLiveAuction("reverse-race");
    const saleId = await sellFirstPlayer(fixture);
    await pause(fixture);

    const [left, right] = await Promise.all([
      reverseSale(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        reason: "Race one",
        saleId,
      }),
      reverseSale(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        reason: "Race two",
        saleId,
      }),
    ]);

    expect([left.status, right.status].sort()).toEqual([
      "accepted",
      "rejected",
    ]);
    const reversals = await pool.query<{ count: number }>(
      `select count(*)::int as count from "sale_reversal" where "sale_id" = $1`,
      [saleId],
    );
    expect(reversals.rows[0]!.count).toBe(1);
    const memberships = await pool.query<{ count: number }>(
      `select count(*)::int as count from "unsold_membership"
        where "auction_id" = $1 and "player_entry_id" = $2
          and "resolved_at" is null`,
      [fixture.auctionId, fixture.players[0]!.id],
    );
    expect(memberships.rows[0]!.count).toBe(1);
  });

  it("lets the reversed Player be offered again after Resume", async () => {
    const fixture = await buildLiveAuction("reverse-reoffer");
    const saleId = await sellFirstPlayer(fixture);
    await pause(fixture);
    await reverseSale(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      reason: "Correction",
      saleId,
    });
    await resumeAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });

    const reoffered = await selectPlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      playerEntryId: fixture.players[0]!.id,
      selectionMethod: "manual",
    });

    expect(reoffered.status).toBe("accepted");
    if (reoffered.status !== "accepted") return;
    expect(reoffered.result.startingPrice).toBe(10);
  });
});
