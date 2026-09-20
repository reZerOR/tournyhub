import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  beginManualClose,
  finalizePresentation,
} from "@/server/auction-command/close-player";
import { selectPlayer } from "@/server/auction-command/select-player";
import {
  activateTier,
  closeUnsoldPool,
  startUnsoldRound,
} from "@/server/auction-command/tier-progress";
import { cleanupTestUsers, pool, resetLiveAuctions } from "./support";
import {
  buildLiveAuction,
  buildLiveTieredAuction,
  type TieredLiveFixture,
} from "./live-support";

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

async function present(
  fixture: TieredLiveFixture,
  index: number,
): Promise<string> {
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

/** Offers a Player, closes it with a Manual Close warning, and leaves it Unsold. */
async function completeUnsold(
  fixture: TieredLiveFixture,
  index: number,
): Promise<string> {
  const presentationId = await present(fixture, index);
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
  return presentationId;
}

/** Completes the whole Bronze Tier and activates Gold. */
async function advanceToGold(fixture: TieredLiveFixture): Promise<void> {
  await completeUnsold(fixture, 0);
  await completeUnsold(fixture, 1);
  const activated = await activateTier(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
    tierId: fixture.tiers[1]!.id,
  });
  if (activated.status !== "accepted") {
    throw new Error(`activation failed: ${JSON.stringify(activated)}`);
  }
}

describe("Tier progression", () => {
  it("refuses the later Tier while the current Tier still has unoffered Players", async () => {
    const fixture = await buildLiveTieredAuction("tier-incomplete");

    const outcome = await activateTier(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      tierId: fixture.tiers[1]!.id,
    });

    expect(outcome).toMatchObject({
      reason: "tier_progress_incomplete",
      status: "rejected",
    });
  });

  it("refuses every Tier activation while a Player is Active", async () => {
    const fixture = await buildLiveTieredAuction("tier-active");
    await completeUnsold(fixture, 0);
    await present(fixture, 1);

    const outcome = await activateTier(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      tierId: fixture.tiers[1]!.id,
    });

    expect(outcome).toMatchObject({
      reason: "presentation_active",
      status: "rejected",
    });
  });

  it("refuses a non-Organizer, an unknown Tier, and a stale command", async () => {
    const fixture = await buildLiveTieredAuction("tier-guards");
    const stale = await revision(fixture.auctionId);

    expect(
      (
        await activateTier(pool, {
          actorUserId: fixture.redsRepUserId,
          auctionId: fixture.auctionId,
          commandId: commandId(),
          expectedRevision: stale,
          tierId: fixture.tiers[1]!.id,
        })
      ).status,
    ).toBe("unauthorized");

    expect(
      await activateTier(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: stale,
        tierId: randomUUID(),
      }),
    ).toMatchObject({ reason: "tier_not_in_auction" });

    expect(
      await activateTier(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: stale + 100,
        tierId: fixture.tiers[1]!.id,
      }),
    ).toMatchObject({ reason: "stale_revision" });
  });

  it("refuses a Tier that is already complete", async () => {
    const fixture = await buildLiveTieredAuction("tier-complete");
    await completeUnsold(fixture, 0);
    await completeUnsold(fixture, 1);

    const outcome = await activateTier(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      tierId: fixture.tiers[0]!.id,
    });

    expect(outcome).toMatchObject({
      reason: "no_next_tier",
      status: "rejected",
    });
  });

  it("activates the next Tier with one committed revision and an Audit Entry", async () => {
    const fixture = await buildLiveTieredAuction("tier-activate");
    await completeUnsold(fixture, 0);
    await completeUnsold(fixture, 1);
    const before = await revision(fixture.auctionId);

    const outcome = await activateTier(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: before,
      tierId: fixture.tiers[1]!.id,
    });

    expect(outcome.status).toBe("accepted");
    expect(await revision(fixture.auctionId)).toBe(before + 1);

    const auction = await pool.query<{ active_tier_id: null | string }>(
      `select "active_tier_id" from "auction" where "id" = $1`,
      [fixture.auctionId],
    );
    expect(auction.rows[0]!.active_tier_id).toBe(fixture.tiers[1]!.id);

    const audit = await pool.query<{ count: number }>(
      `select count(*)::int as count from "audit_entry"
        where "auction_id" = $1 and "action" = 'activate_tier'`,
      [fixture.auctionId],
    );
    expect(audit.rows[0]!.count).toBe(1);

    const outbox = await pool.query<{ kind: string; revision: number }>(
      `select "kind", "revision" from "auction_outbox_event"
        where "auction_id" = $1 order by "id" desc limit 1`,
      [fixture.auctionId],
    );
    expect(outbox.rows[0]).toMatchObject({
      kind: "tier_activated",
      revision: before + 1,
    });
  });
});

describe("Unsold Rounds", () => {
  it("refuses a round while the Active Tier still has unoffered Players", async () => {
    const fixture = await buildLiveTieredAuction("round-too-early");

    const outcome = await startUnsoldRound(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });

    expect(outcome).toMatchObject({
      reason: "tier_progress_incomplete",
      status: "rejected",
    });
  });

  it("refuses a round under Simple Rules until every Player is offered", async () => {
    const fixture = await buildLiveAuction("round-simple");

    const outcome = await startUnsoldRound(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });

    expect(outcome).toMatchObject({
      reason: "tier_progress_incomplete",
      status: "rejected",
    });
  });

  it("opens a round over the Unsold Pool only, and tracks what it offered", async () => {
    const fixture = await buildLiveTieredAuction("round-pool");
    await advanceToGold(fixture);
    await completeUnsold(fixture, 2);
    await completeUnsold(fixture, 3);

    const started = await startUnsoldRound(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    expect(started.status).toBe("accepted");
    if (started.status !== "accepted") return;

    const presentationId = await completeUnsold(fixture, 0);
    const presentation = await pool.query<{
      starting_price: number;
      unsold_round_id: null | string;
    }>(
      `select "starting_price", "unsold_round_id"
         from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    expect(presentation.rows[0]).toMatchObject({
      starting_price: fixture.tiers[0]!.startingPrice,
      unsold_round_id: started.result.roundId,
    });

    const again = await selectPlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      selectionMethod: "random",
      random: () => 0,
    });
    expect(again.status).toBe("accepted");
    if (again.status !== "accepted") return;
    // Only Unsold Pool Players are exposed, and a Player already completed
    // during this round is not offered a second time.
    expect(fixture.players.map((player) => player.id)).toContain(
      again.result.playerEntryId,
    );
    expect(again.result.playerEntryId).not.toBe(fixture.players[0]!.id);

    const tracked = await pool.query<{ count: number }>(
      `select count(*)::int as count from "player_presentation"
        where "unsold_round_id" = $1 and "state" in ('sold', 'unsold')`,
      [started.result.roundId],
    );
    expect(tracked.rows[0]!.count).toBe(1);
  });

  it("blocks closing a round whose unresolved minimums need matching", async () => {
    const fixture = await buildLiveTieredAuction("round-blocked-close");
    await advanceToGold(fixture);
    await completeUnsold(fixture, 2);
    await completeUnsold(fixture, 3);
    await startUnsoldRound(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });

    const outcome = await closeUnsoldPool(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });

    expect(outcome).toMatchObject({
      reason: "matching_required",
      status: "rejected",
    });
  });

  it("closes an exhausted round and runs another over the same Pool", async () => {
    const fixture = await buildLiveTieredAuction("round-repeat");
    await advanceToGold(fixture);
    await completeUnsold(fixture, 2);
    await completeUnsold(fixture, 3);

    const first = await startUnsoldRound(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    expect(first.status).toBe("accepted");
    if (first.status !== "accepted") return;
    expect(first.result.sequence).toBe(1);

    // Offer and complete every Pool Player so the round has nothing left.
    for (let index = 0; index < fixture.players.length; index += 1) {
      await completeUnsold(fixture, index);
    }

    const closed = await closeUnsoldPool(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    expect(closed.status).toBe("accepted");
    if (closed.status !== "accepted") return;
    expect(closed.result.kind).toBe("round_closed");

    const second = await startUnsoldRound(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    expect(second.status).toBe("accepted");
    if (second.status !== "accepted") return;
    expect(second.result.sequence).toBe(2);

    const rounds = await pool.query<{ count: number }>(
      `select count(*)::int as count from "unsold_round" where "auction_id" = $1`,
      [fixture.auctionId],
    );
    expect(rounds.rows[0]!.count).toBe(2);
  });

  it("reoffers a Player at its frozen Starting Price and keeps prior history", async () => {
    const fixture = await buildLiveTieredAuction("round-frozen-price");
    await advanceToGold(fixture);
    await completeUnsold(fixture, 2);
    await completeUnsold(fixture, 3);

    const first = await startUnsoldRound(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    if (first.status !== "accepted") throw new Error("round failed");
    for (let index = 0; index < fixture.players.length; index += 1) {
      await completeUnsold(fixture, index);
    }
    await closeUnsoldPool(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    await startUnsoldRound(pool, {
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
    expect(reoffered.result.startingPrice).toBe(
      fixture.tiers[0]!.startingPrice,
    );

    const presentations = await pool.query<{ count: number; state: string }>(
      `select count(*)::int as count, min("state") as state
         from "player_presentation" where "player_entry_id" = $1`,
      [fixture.players[0]!.id],
    );
    // The original Tier Presentation, the first round's Presentation, and the
    // new one all remain in history.
    expect(presentations.rows[0]!.count).toBe(3);
    expect(presentations.rows[0]!.state).toBe("open");
  });

  it("replays a repeated Unsold Round command without a second round", async () => {
    const fixture = await buildLiveTieredAuction("round-idempotent");
    await advanceToGold(fixture);
    await completeUnsold(fixture, 2);
    await completeUnsold(fixture, 3);
    const id = commandId();
    const expected = await revision(fixture.auctionId);

    const first = await startUnsoldRound(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: expected,
    });
    const second = await startUnsoldRound(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: expected,
    });

    expect(first.status).toBe("accepted");
    expect(second.status).toBe("replayed");
    const rounds = await pool.query<{ count: number }>(
      `select count(*)::int as count from "unsold_round" where "auction_id" = $1`,
      [fixture.auctionId],
    );
    expect(rounds.rows[0]!.count).toBe(1);
  });
});
