import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

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

async function presentFirstPlayer(
  fixture: LiveFixture,
  index = 0,
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

describe("placeBid", () => {
  it("accepts the exact first Bid and advances the revision once", async () => {
    const fixture = await buildLiveAuction("bid-accept");
    const presentationId = await presentFirstPlayer(fixture);
    const before = await revision(fixture.auctionId);

    const outcome = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: before,
      presentationId,
      teamId: fixture.redsTeamId,
    });

    expect(outcome.status).toBe("accepted");
    expect(await revision(fixture.auctionId)).toBe(before + 1);

    const accepted = await pool.query<{ count: number }>(
      `select count(*)::int as count from "bid_attempt"
        where "presentation_id" = $1 and "status" = 'accepted'`,
      [presentationId],
    );
    expect(accepted.rows[0]!.count).toBe(1);
  });

  it("rejects a wrong amount, an already-leading Team, and a stale revision", async () => {
    const fixture = await buildLiveAuction("bid-rejections");
    const presentationId = await presentFirstPlayer(fixture);

    const wrongAmount = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 5,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });
    expect(wrongAmount).toMatchObject({
      reason: "wrong_amount",
      status: "rejected",
    });

    await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });

    const leading = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 15,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });
    expect(leading).toMatchObject({
      reason: "already_leading",
      status: "rejected",
    });

    const stale = await placeBid(pool, {
      actorUserId: fixture.bluesRepUserId,
      amount: 15,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: 1,
      presentationId,
      teamId: fixture.bluesTeamId,
    });
    expect(stale).toMatchObject({
      reason: "stale_revision",
      status: "rejected",
    });
  });

  it("rejects a Team that cannot afford the next Bid", async () => {
    const fixture = await buildLiveAuction("bid-budget", { budget: 12 });
    const presentationId = await presentFirstPlayer(fixture);

    await placeBid(pool, {
      actorUserId: fixture.bluesRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.bluesTeamId,
    });

    const outcome = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 15,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });

    expect(outcome).toMatchObject({
      reason: "insufficient_budget",
      status: "rejected",
    });
  });

  it("rejects a Team that has reached its maximum Roster size", async () => {
    const fixture = await buildLiveAuction("bid-roster-max", {
      rosterMax: 2,
      rosterMin: 1,
    });
    const firstPresentation = await presentFirstPlayer(fixture, 0);
    await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId: firstPresentation,
      teamId: fixture.redsTeamId,
    });
    await pool.query(
      `update "player_presentation"
          set "state" = 'sold', "closed_at" = now() where "id" = $1`,
      [firstPresentation],
    );
    await pool.query(
      `insert into "sale"
          ("auction_id", "presentation_id", "player_entry_id", "team_id",
           "amount", "source")
       select $1, $2, $3, $4, 10, 'bid'`,
      [
        fixture.auctionId,
        firstPresentation,
        fixture.players[0]!.id,
        fixture.redsTeamId,
      ],
    );

    const secondPresentation = await presentFirstPlayer(fixture, 1);
    await placeBid(pool, {
      actorUserId: fixture.bluesRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId: secondPresentation,
      teamId: fixture.bluesTeamId,
    });

    const outcome = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 15,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId: secondPresentation,
      teamId: fixture.redsTeamId,
    });

    expect(outcome).toMatchObject({
      reason: "roster_max_reached",
      status: "rejected",
    });
  });

  it("rejects a forged Team a Representative does not control", async () => {
    const fixture = await buildLiveAuction("bid-forged");
    const presentationId = await presentFirstPlayer(fixture);

    const outcome = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.bluesTeamId,
    });

    expect(outcome).toMatchObject({
      reason: "not_representative",
      status: "rejected",
    });
  });

  it("replays a duplicate command ID without a second Bid", async () => {
    const fixture = await buildLiveAuction("bid-idempotent");
    const presentationId = await presentFirstPlayer(fixture);
    const id = commandId();
    const expected = await revision(fixture.auctionId);

    const first = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: expected,
      presentationId,
      teamId: fixture.redsTeamId,
    });
    const second = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: expected,
      presentationId,
      teamId: fixture.redsTeamId,
    });

    expect(first.status).toBe("accepted");
    expect(second.status).toBe("replayed");
    const count = await pool.query<{ count: number }>(
      `select count(*)::int as count from "bid_attempt" where "presentation_id" = $1`,
      [presentationId],
    );
    expect(count.rows[0]!.count).toBe(1);
    expect(await revision(fixture.auctionId)).toBe(expected + 1);
  });

  it("accepts only one of two simultaneous equal-price Bids", async () => {
    const fixture = await buildLiveAuction("bid-simultaneous");
    const presentationId = await presentFirstPlayer(fixture);
    const expected = await revision(fixture.auctionId);

    const [reds, blues] = await Promise.all([
      placeBid(pool, {
        actorUserId: fixture.redsRepUserId,
        amount: 10,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: expected,
        presentationId,
        teamId: fixture.redsTeamId,
      }),
      placeBid(pool, {
        actorUserId: fixture.bluesRepUserId,
        amount: 10,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: expected,
        presentationId,
        teamId: fixture.bluesTeamId,
      }),
    ]);

    const accepted = [reds, blues].filter(
      (outcome) => outcome.status === "accepted",
    );
    expect(accepted).toHaveLength(1);
    const rejected = [reds, blues].find(
      (outcome) => outcome.status === "rejected",
    );
    expect(rejected).toBeDefined();

    const count = await pool.query<{ count: number }>(
      `select count(*)::int as count from "bid_attempt"
        where "presentation_id" = $1 and "status" = 'accepted'`,
      [presentationId],
    );
    expect(count.rows[0]!.count).toBe(1);
  });

  it("accepts a custom jump bid and calculates the next minimum bid from it", async () => {
    const fixture = await buildLiveAuction("bid-custom-jump");
    const presentationId = await presentFirstPlayer(fixture);

    // Opening custom jump bid: starting price is 10, bid 25
    const outcome = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 25,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });
    expect(outcome.status).toBe("accepted");
    if (outcome.status === "accepted") {
      expect(outcome.result.amount).toBe(25);
    }

    // Next minimum bid must be 25 + 5 = 30. A bid of 28 is rejected as wrong_amount.
    const belowMin = await placeBid(pool, {
      actorUserId: fixture.bluesRepUserId,
      amount: 28,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.bluesTeamId,
    });
    expect(belowMin).toMatchObject({
      reason: "wrong_amount",
      status: "rejected",
    });

    // A bid of 35 (valid jump) is accepted.
    const validJump = await placeBid(pool, {
      actorUserId: fixture.bluesRepUserId,
      amount: 35,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.bluesTeamId,
    });
    expect(validJump.status).toBe("accepted");
    if (validJump.status === "accepted") {
      expect(validJump.result.amount).toBe(35);
    }
  });
});
