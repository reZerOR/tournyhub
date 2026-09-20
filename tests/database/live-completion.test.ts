import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  beginManualClose,
  finalizePresentation,
} from "@/server/auction-command/close-player";
import {
  completeAuction,
  pauseAuction,
  resumeAuction,
} from "@/server/auction-command/lifecycle";
import { placeBid } from "@/server/auction-command/place-bid";
import { selectPlayer } from "@/server/auction-command/select-player";
import {
  activateTier,
  closeUnsoldPool,
  requestConstrainedMatching,
  startUnsoldRound,
} from "@/server/auction-command/tier-progress";
import { getLiveSnapshot } from "@/server/auction-query/live-snapshot";
import { cleanupTestUsers, pool, resetLiveAuctions } from "./support";
import {
  buildLiveAuction,
  buildLiveTieredAuction,
  type LiveFixture,
  type TieredLiveFixture,
} from "./live-support";

afterAll(cleanupTestUsers);

beforeEach(resetLiveAuctions);
afterEach(resetLiveAuctions);

type AnyFixture = LiveFixture | TieredLiveFixture;

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

async function present(fixture: AnyFixture, index: number): Promise<string> {
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

async function closeActivePresentation(
  fixture: AnyFixture,
  presentationId: string,
): Promise<"sold" | "unsold"> {
  const started = await beginManualClose(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
    presentationId,
  });
  if (started.status !== "accepted") {
    throw new Error(`close warning failed: ${JSON.stringify(started)}`);
  }
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
  if (outcome.status !== "accepted") {
    throw new Error(`finalize failed: ${JSON.stringify(outcome)}`);
  }
  return outcome.result.kind;
}

/** Offers a Player, closes it, and leaves it Unsold. */
async function completeUnsold(
  fixture: AnyFixture,
  index: number,
): Promise<string> {
  const presentationId = await present(fixture, index);
  await closeActivePresentation(fixture, presentationId);
  return presentationId;
}

/** Offers a Player, takes a Bid for one Team, then commits the Sale. */
async function sellPlayer(
  fixture: AnyFixture,
  index: number,
  teamId: string,
  repUserId: string,
  amount: number,
): Promise<void> {
  const presentationId = await present(fixture, index);
  const bid = await placeBid(pool, {
    actorUserId: repUserId,
    amount,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
    presentationId,
    teamId,
  });
  if (bid.status !== "accepted") {
    throw new Error(`bid failed: ${JSON.stringify(bid)}`);
  }
  await closeActivePresentation(fixture, presentationId);
}

/** Offers and completes every Player, activating each Tier in order. */
async function completeEveryPlayer(fixture: AnyFixture): Promise<void> {
  if (!("tiers" in fixture)) {
    for (let index = 0; index < fixture.players.length; index += 1) {
      await completeUnsold(fixture, index);
    }
    return;
  }

  for (const [tierIndex, tier] of fixture.tiers.entries()) {
    const indices = fixture.players
      .map((player, index) => ({ index, player }))
      .filter((entry) => entry.player.tierId === tier.id)
      .map((entry) => entry.index);
    for (const index of indices) {
      await completeUnsold(fixture, index);
    }
    const next = fixture.tiers[tierIndex + 1];
    if (!next) continue;
    const activated = await activateTier(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      tierId: next.id,
    });
    if (activated.status !== "accepted") {
      throw new Error(`activation failed: ${JSON.stringify(activated)}`);
    }
  }
}

async function openRound(fixture: AnyFixture): Promise<string> {
  const started = await startUnsoldRound(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
  });
  if (started.status !== "accepted") {
    throw new Error(`round failed: ${JSON.stringify(started)}`);
  }
  return started.result.roundId;
}

/** Completion is deliberate, so it is only reachable while Paused. */
async function pause(fixture: AnyFixture): Promise<void> {
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

async function resume(fixture: AnyFixture): Promise<void> {
  const outcome = await resumeAuction(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
  });
  if (outcome.status !== "accepted") {
    throw new Error(`resume failed: ${JSON.stringify(outcome)}`);
  }
}

/** A completion attempt against the Auction's current revision. */
async function complete(fixture: AnyFixture) {
  return completeAuction(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
  });
}

async function closeRound(fixture: AnyFixture): Promise<void> {
  const outcome = await closeUnsoldPool(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
  });
  if (outcome.status !== "accepted") {
    throw new Error(`close failed: ${JSON.stringify(outcome)}`);
  }
}

describe("Forced Assignment", () => {
  it("creates one Forced Assignment at the frozen Starting Price", async () => {
    const fixture = await buildLiveAuction("forced-single", {
      playerCount: 2,
      rosterMax: 3,
      rosterMin: 2,
    });
    await sellPlayer(fixture, 0, fixture.redsTeamId, fixture.redsRepUserId, 10);
    await completeUnsold(fixture, 1);
    await openRound(fixture);

    const before = await revision(fixture.auctionId);
    const outcome = await closeUnsoldPool(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: before,
    });

    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") return;
    expect(outcome.result.kind).toBe("forced");
    expect(await revision(fixture.auctionId)).toBe(before + 1);

    const sale = await pool.query<{
      amount: number;
      source: string;
      team_id: string;
    }>(
      `select "amount", "source", "team_id" from "sale"
        where "auction_id" = $1 and "player_entry_id" = $2`,
      [fixture.auctionId, fixture.players[1]!.id],
    );
    expect(sale.rows[0]).toMatchObject({
      amount: 10,
      source: "forced",
      team_id: fixture.bluesTeamId,
    });

    // No Bid Attempt is created for a Forced Assignment.
    const bids = await pool.query<{ count: number }>(
      `select count(*)::int as count from "bid_attempt"
        where "auction_id" = $1 and "team_id" = $2`,
      [fixture.auctionId, fixture.bluesTeamId],
    );
    expect(bids.rows[0]!.count).toBe(0);

    // Roster, spent, and remaining Credits follow from the committed Sale.
    const snapshot = await getLiveSnapshot(
      pool,
      fixture.bluesRepUserId,
      fixture.auctionId,
    );
    expect(snapshot!.snapshot.you.rosterCount).toBe(2);
    expect(snapshot!.snapshot.you.spentCredits).toBe(10);
    expect(snapshot!.snapshot.you.remainingBudget).toBe(90);
    expect(snapshot!.snapshot.deficientTeamIds).toHaveLength(0);
  });

  it("resolves several deficient Teams with constrained random matching", async () => {
    const fixture = await buildLiveTieredAuction("forced-matching", {
      playersPerTier: 3,
    });
    await completeEveryPlayer(fixture);
    const roundId = await openRound(fixture);

    const blocked = await closeUnsoldPool(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    expect(blocked).toMatchObject({
      reason: "matching_required",
      status: "rejected",
    });

    const before = await revision(fixture.auctionId);
    const matched = await requestConstrainedMatching(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: before,
      random: () => 0.5,
    });
    expect(matched.status).toBe("accepted");
    if (matched.status !== "accepted") return;
    // Every Team needs one Bronze and one Gold Player, so four assignments.
    expect(matched.result.assignments).toHaveLength(4);
    expect(await revision(fixture.auctionId)).toBe(before + 1);

    const snapshot = await getLiveSnapshot(
      pool,
      fixture.organizerId,
      fixture.auctionId,
    );
    expect(snapshot!.snapshot.deficientTeamIds).toHaveLength(0);
    for (const team of snapshot!.snapshot.teams) {
      expect(team.rosterCount).toBe(3);
      // Bronze costs 10 and Gold costs 20.
      expect(team.spentCredits).toBe(30);
      expect(team.remainingBudget).toBe(170);
    }

    // The chosen assignments came from this round and are recorded for audit.
    const forcedSales = await pool.query<{ count: number }>(
      `select count(*)::int as count from "sale"
        where "auction_id" = $1 and "source" = 'forced'`,
      [fixture.auctionId],
    );
    expect(forcedSales.rows[0]!.count).toBe(4);

    const audit = await pool.query<{
      details: { assignments: unknown[]; candidates: unknown[] };
    }>(
      `select "details" from "audit_entry"
        where "auction_id" = $1 and "action" = 'constrained_matching'`,
      [fixture.auctionId],
    );
    expect(audit.rows[0]!.details.assignments).toHaveLength(4);
    expect(audit.rows[0]!.details.candidates).toHaveLength(6);

    const presentations = await pool.query<{ count: number }>(
      `select count(*)::int as count from "player_presentation"
        where "unsold_round_id" = $1`,
      [roundId],
    );
    expect(presentations.rows[0]!.count).toBe(4);
  });

  it("refuses matching when no complete assignment exists", async () => {
    const fixture = await buildLiveTieredAuction("forced-none", {
      playersPerTier: 2,
    });
    await completeEveryPlayer(fixture);
    await openRound(fixture);
    // Mark every Bronze Pool entry Final Unsold so the remaining minimums can
    // no longer be satisfied. The command layer cannot reach this state; it
    // exists here to prove the engine refuses rather than mis-assigning.
    await pool.query(
      `update "unsold_membership"
          set "resolved_at" = now(), "resolution" = 'final_unsold'
        where "auction_id" = $1 and "tier_id" = $2`,
      [fixture.auctionId, fixture.tiers[0]!.id],
    );

    const outcome = await requestConstrainedMatching(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });

    expect(outcome).toMatchObject({
      reason: "no_feasible_matching",
      status: "rejected",
    });
  });

  it("marks the remaining Pool Players Final Unsold once minimums are met", async () => {
    const fixture = await buildLiveTieredAuction("forced-final-unsold", {
      playersPerTier: 3,
    });
    await completeEveryPlayer(fixture);
    await openRound(fixture);
    await requestConstrainedMatching(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      random: () => 0,
    });

    const outcome = await closeUnsoldPool(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });

    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") return;
    expect(outcome.result).toMatchObject({
      finalUnsoldCount: 2,
      kind: "final_unsold",
    });

    const unresolved = await pool.query<{ count: number }>(
      `select count(*)::int as count from "unsold_membership"
        where "auction_id" = $1 and "resolved_at" is null`,
      [fixture.auctionId],
    );
    expect(unresolved.rows[0]!.count).toBe(0);
  });
});

describe("Auction completion guards", () => {
  it("refuses to complete a Live Auction", async () => {
    const fixture = await buildLiveAuction("complete-live");

    const outcome = await complete(fixture);

    expect(outcome).toMatchObject({
      reason: "auction_not_paused",
      status: "rejected",
    });
  });

  it("refuses while a Player is Active", async () => {
    const fixture = await buildLiveAuction("complete-active");
    await present(fixture, 0);
    await pause(fixture);

    const outcome = await complete(fixture);

    expect(outcome).toMatchObject({
      reason: "presentation_active",
      status: "rejected",
    });
  });

  it("refuses while a Tier remains unresolved", async () => {
    const fixture = await buildLiveTieredAuction("complete-tier-open");
    await pause(fixture);

    const outcome = await complete(fixture);

    expect(outcome).toMatchObject({
      reason: "tier_progress_incomplete",
      status: "rejected",
    });
  });

  it("refuses while an Unsold Round or the Unsold Pool remains open", async () => {
    const fixture = await buildLiveTieredAuction("complete-pool", {
      playersPerTier: 3,
    });
    await completeEveryPlayer(fixture);

    await pause(fixture);
    expect(await complete(fixture)).toMatchObject({
      reason: "unsold_pool_open",
    });

    await resume(fixture);
    await openRound(fixture);
    await pause(fixture);
    expect(await complete(fixture)).toMatchObject({
      reason: "unsold_round_open",
    });
  });

  it("refuses while a Player was never offered", async () => {
    const fixture = await buildLiveAuction("complete-unresolved");
    await completeUnsold(fixture, 0);
    await pause(fixture);

    expect(await complete(fixture)).toMatchObject({
      reason: "auction_incomplete",
    });
  });

  it("refuses while a Team misses a required minimum", async () => {
    const fixture = await buildLiveTieredAuction("complete-minimums");
    await completeEveryPlayer(fixture);
    // Resolve the Pool without satisfying the minimums, which the command
    // layer cannot reach: this exercises the defensive guard.
    await pool.query(
      `update "unsold_membership"
          set "resolved_at" = now(), "resolution" = 'final_unsold'
        where "auction_id" = $1`,
      [fixture.auctionId],
    );
    await pause(fixture);

    const outcome = await complete(fixture);
    expect(outcome).toMatchObject({
      reason: "minimums_unresolved",
      status: "rejected",
    });
  });
});

describe("Auction completion", () => {
  it("completes once nothing is unresolved and publishes one Results revision", async () => {
    const fixture = await buildLiveTieredAuction("complete-success", {
      playersPerTier: 3,
    });
    await completeEveryPlayer(fixture);
    await openRound(fixture);
    await requestConstrainedMatching(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      random: () => 0,
    });
    await closeRound(fixture);
    await pause(fixture);

    const before = await revision(fixture.auctionId);
    const outcome = await complete(fixture);

    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") return;
    const revisionAfter = await revision(fixture.auctionId);
    expect(revisionAfter).toBe(before + 1);

    const auction = await pool.query<{
      completed_at: Date | null;
      status: string;
    }>(`select "status", "completed_at" from "auction" where "id" = $1`, [
      fixture.auctionId,
    ]);
    expect(auction.rows[0]).toMatchObject({ status: "completed" });
    expect(auction.rows[0]!.completed_at).not.toBeNull();

    const published = await pool.query<{ payload: unknown }>(
      `select "payload" from "auction_revision"
        where "auction_id" = $1 and "revision" = $2`,
      [fixture.auctionId, revisionAfter],
    );
    expect(published.rows).toHaveLength(1);
    expect(published.rows[0]!.payload).toMatchObject({
      results: { teams: expect.any(Array) },
    });

    // A completed Auction is read-only.
    expect(
      await getLiveSnapshot(pool, fixture.organizerId, fixture.auctionId),
    ).toBeNull();
    expect(
      await selectPlayer(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: revisionAfter,
        selectionMethod: "random",
      }),
    ).toMatchObject({ reason: "auction_not_live" });
    expect(
      await resumeAuction(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: revisionAfter,
      }),
    ).toMatchObject({ reason: "not_paused" });
  });

  it("replays a repeated completion command without a second revision", async () => {
    const fixture = await buildLiveTieredAuction("complete-idempotent", {
      playersPerTier: 3,
    });
    await completeEveryPlayer(fixture);
    await openRound(fixture);
    await requestConstrainedMatching(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      random: () => 0,
    });
    await closeRound(fixture);
    await pause(fixture);

    const id = commandId();
    const expected = await revision(fixture.auctionId);
    const first = await completeAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: expected,
    });
    const second = await completeAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: expected,
    });

    expect(first.status).toBe("accepted");
    expect(second.status).toBe("replayed");
    const revisions = await pool.query<{ count: number }>(
      `select count(*)::int as count from "auction_revision"
        where "auction_id" = $1 and "revision" > 1`,
      [fixture.auctionId],
    );
    expect(revisions.rows[0]!.count).toBe(1);
  });
});
