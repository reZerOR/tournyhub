import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  beginManualClose,
  cancelManualClose,
  finalizePresentation,
} from "@/server/auction-command/close-player";
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

async function beginClose(
  fixture: LiveFixture,
  presentationId: string,
): Promise<string> {
  const outcome = await beginManualClose(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
    presentationId,
  });
  if (outcome.status !== "accepted") {
    throw new Error(`begin close failed: ${JSON.stringify(outcome)}`);
  }
  return outcome.result.warningDeadline;
}

/** Moves the stored warning deadline into the past without waiting three seconds. */
async function expireWarning(presentationId: string): Promise<void> {
  await pool.query(
    `update "player_presentation"
        set "warning_deadline" = now() - interval '1 second'
      where "id" = $1`,
    [presentationId],
  );
}

describe("Manual Close", () => {
  it("stores a three-second database deadline and refuses a non-Organizer", async () => {
    const fixture = await buildLiveAuction("close-begin");
    const presentationId = await present(fixture);

    const forbidden = await beginManualClose(pool, {
      actorUserId: fixture.redsRepUserId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
    });
    expect(forbidden.status).toBe("unauthorized");

    const deadline = await beginClose(fixture, presentationId);
    const ms = new Date(deadline).getTime() - Date.now();
    expect(ms).toBeGreaterThan(1000);
    expect(ms).toBeLessThanOrEqual(4000);

    const row = await pool.query<{ state: string }>(
      `select "state" from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    expect(row.rows[0]!.state).toBe("closing");
  });

  it("refuses Manual Close on a Timed Close Auction", async () => {
    const fixture = await buildLiveAuction("close-timed", {
      closeMode: "timed",
    });
    const presentationId = await present(fixture);

    const outcome = await beginManualClose(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
    });

    expect(outcome).toMatchObject({
      reason: "not_manual_close",
      status: "rejected",
    });
  });

  it("cancels the warning without changing the leading Team or price", async () => {
    const fixture = await buildLiveAuction("close-cancel");
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
    await beginClose(fixture, presentationId);

    const outcome = await cancelManualClose(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
    });

    expect(outcome.status).toBe("accepted");
    const presentation = await pool.query<{
      state: string;
      warning_deadline: Date | null;
    }>(
      `select "state", "warning_deadline" from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    expect(presentation.rows[0]).toMatchObject({
      state: "open",
      warning_deadline: null,
    });
    const leader = await pool.query<{ amount: number; team_id: string }>(
      `select "amount", "team_id" from "bid_attempt"
        where "presentation_id" = $1 and "status" = 'accepted'`,
      [presentationId],
    );
    expect(leader.rows[0]).toMatchObject({
      amount: 10,
      team_id: fixture.redsTeamId,
    });
  });

  it("reopens the Presentation when a valid Bid arrives during the warning", async () => {
    const fixture = await buildLiveAuction("close-reopen");
    const presentationId = await present(fixture);
    await beginClose(fixture, presentationId);

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
    const presentation = await pool.query<{
      state: string;
      warning_deadline: Date | null;
    }>(
      `select "state", "warning_deadline" from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    expect(presentation.rows[0]).toMatchObject({
      state: "open",
      warning_deadline: null,
    });
  });

  it("refuses to finalize before the warning deadline, then creates one Sale", async () => {
    const fixture = await buildLiveAuction("close-sale");
    const presentationId = await present(fixture);
    await placeBid(pool, {
      actorUserId: fixture.bluesRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.bluesTeamId,
    });
    await beginClose(fixture, presentationId);

    const early = await finalizePresentation(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      presentationId,
    });
    expect(early).toMatchObject({ reason: "too_early", status: "rejected" });

    await expireWarning(presentationId);
    const before = await revision(fixture.auctionId);
    const sold = await finalizePresentation(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      presentationId,
    });

    expect(sold.status).toBe("accepted");
    expect(await revision(fixture.auctionId)).toBe(before + 1);

    const sale = await pool.query<{ amount: number; team_id: string }>(
      `select "amount", "team_id" from "sale"
        where "presentation_id" = $1 and "reversed_at" is null`,
      [presentationId],
    );
    expect(sale.rows[0]).toMatchObject({
      amount: 10,
      team_id: fixture.bluesTeamId,
    });

    const presentation = await pool.query<{ state: string }>(
      `select "state" from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    expect(presentation.rows[0]!.state).toBe("sold");
  });

  it("marks a Player with no Bid Unsold and puts it in the Unsold Pool", async () => {
    const fixture = await buildLiveAuction("close-unsold");
    const presentationId = await present(fixture);
    await beginClose(fixture, presentationId);
    await expireWarning(presentationId);

    const outcome = await finalizePresentation(pool, {
      actorUserId: fixture.bluesRepUserId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      presentationId,
    });

    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") return;
    expect(outcome.result).toEqual({ kind: "unsold" });

    const membership = await pool.query<{ count: number }>(
      `select count(*)::int as count from "unsold_membership"
        where "presentation_id" = $1`,
      [presentationId],
    );
    expect(membership.rows[0]!.count).toBe(1);
  });

  it("produces one outcome for duplicate finalizers", async () => {
    const fixture = await buildLiveAuction("close-duplicate-finalizer");
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
    await beginClose(fixture, presentationId);
    await expireWarning(presentationId);

    const [first, second] = await Promise.all([
      finalizePresentation(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        presentationId,
      }),
      finalizePresentation(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        presentationId,
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
  });

  it("rejects a late Bid once the warning deadline has passed", async () => {
    const fixture = await buildLiveAuction("close-late-bid");
    const presentationId = await present(fixture);
    await beginClose(fixture, presentationId);
    await expireWarning(presentationId);

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
});
