import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { placeBid } from "@/server/auction-command/place-bid";
import {
  returnActivePlayer,
  selectPlayer,
} from "@/server/auction-command/select-player";
import { cleanupTestUsers, pool, resetLiveAuctions } from "./support";
import { buildLiveAuction } from "./live-support";

afterAll(cleanupTestUsers);

beforeEach(resetLiveAuctions);
afterEach(resetLiveAuctions);

function commandId(): string {
  return randomUUID();
}

async function currentRevision(auctionId: string): Promise<number> {
  const result = await pool.query<{ revision: number }>(
    `select "revision" from "auction" where "id" = $1`,
    [auctionId],
  );
  return result.rows[0]!.revision;
}

async function eligibleIds(auctionId: string): Promise<string[]> {
  const result = await pool.query<{ id: string }>(
    `select pe."id" from "player_entry" pe
      where pe."auction_id" = $1 and not pe."is_representative"
        and not exists (
          select 1 from "player_presentation" pp
           where pp."player_entry_id" = pe."id"
             and pp."state" in ('open', 'closing', 'sold', 'unsold'))
        and not exists (
          select 1 from "sale" s
           where s."player_entry_id" = pe."id" and s."reversed_at" is null)
      order by pe."created_at" asc, pe."id" asc`,
    [auctionId],
  );
  return result.rows.map((row) => row.id);
}

describe("selectPlayer", () => {
  it("activates exactly one Player for the Organizer", async () => {
    const fixture = await buildLiveAuction("select-manual");

    const outcome = await selectPlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await currentRevision(fixture.auctionId),
      playerEntryId: fixture.players[0]!.id,
      selectionMethod: "manual",
    });

    expect(outcome.status).toBe("accepted");
    const rows = await pool.query<{ count: number; state: string }>(
      `select count(*)::int as count, min("state") as state
         from "player_presentation" where "auction_id" = $1`,
      [fixture.auctionId],
    );
    expect(rows.rows[0]).toEqual({ count: 1, state: "open" });

    const snapshot = await pool.query<{ revision: number }>(
      `select "revision" from "auction" where "id" = $1`,
      [fixture.auctionId],
    );
    expect(snapshot.rows[0]!.revision).toBe(2);
  });

  it("refuses a second Active Player and a stale revision", async () => {
    const fixture = await buildLiveAuction("select-active");
    const revision = await currentRevision(fixture.auctionId);

    await selectPlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: revision,
      playerEntryId: fixture.players[0]!.id,
      selectionMethod: "manual",
    });

    const again = await selectPlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await currentRevision(fixture.auctionId),
      playerEntryId: fixture.players[1]!.id,
      selectionMethod: "manual",
    });
    expect(again).toMatchObject({
      reason: "presentation_active",
      status: "rejected",
    });

    const stale = await selectPlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: revision,
      playerEntryId: fixture.players[1]!.id,
      selectionMethod: "manual",
    });
    expect(stale).toMatchObject({
      reason: "stale_revision",
      status: "rejected",
    });
  });

  it("refuses a non-Organizer", async () => {
    const fixture = await buildLiveAuction("select-forged");

    const outcome = await selectPlayer(pool, {
      actorUserId: fixture.redsRepUserId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await currentRevision(fixture.auctionId),
      playerEntryId: fixture.players[0]!.id,
      selectionMethod: "manual",
    });

    expect(outcome.status).toBe("unauthorized");
  });

  it("selects the last eligible Player for a random draw near 1", async () => {
    const fixture = await buildLiveAuction("select-random");
    const eligible = await eligibleIds(fixture.auctionId);

    const outcome = await selectPlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await currentRevision(fixture.auctionId),
      random: () => 0.999,
      selectionMethod: "random",
    });

    expect(outcome.status).toBe("accepted");
    if (outcome.status !== "accepted") return;
    expect(outcome.result.playerEntryId).toBe(eligible[eligible.length - 1]);

    const audit = await pool.query<{
      action: string;
      details: { selectionMethod: string };
    }>(
      `select "action", "details" from "audit_entry"
        where "auction_id" = $1 and "action" = 'random_selection'`,
      [fixture.auctionId],
    );
    expect(audit.rows[0]!.details.selectionMethod).toBe("random");
  });

  it("reports an empty queue when every Player is already offered", async () => {
    const fixture = await buildLiveAuction("select-empty");
    for (const player of fixture.players) {
      await pool.query(
        `insert into "player_presentation"
            ("auction_id", "player_entry_id", "starting_price", "selection_method",
             "state", "close_mode", "opened_at", "closed_at")
         values ($1, $2, 10, 'manual', 'sold', 'manual', now(), now())`,
        [fixture.auctionId, player.id],
      );
    }

    const outcome = await selectPlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await currentRevision(fixture.auctionId),
      selectionMethod: "random",
    });

    expect(outcome).toMatchObject({
      reason: "no_eligible_players",
      status: "rejected",
    });
  });

  it("replays a duplicate command ID without a second Presentation", async () => {
    const fixture = await buildLiveAuction("select-idempotent");
    const id = commandId();
    const revision = await currentRevision(fixture.auctionId);

    const first = await selectPlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: revision,
      playerEntryId: fixture.players[0]!.id,
      selectionMethod: "manual",
    });
    const second = await selectPlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: id,
      expectedRevision: revision,
      playerEntryId: fixture.players[0]!.id,
      selectionMethod: "manual",
    });

    expect(first.status).toBe("accepted");
    expect(second.status).toBe("replayed");
    const count = await pool.query<{ count: number }>(
      `select count(*)::int as count from "player_presentation" where "auction_id" = $1`,
      [fixture.auctionId],
    );
    expect(count.rows[0]!.count).toBe(1);
  });
});

describe("returnActivePlayer", () => {
  it("returns an unbid Player with a reason and records an Audit Entry", async () => {
    const fixture = await buildLiveAuction("return-player");
    const selected = await selectPlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await currentRevision(fixture.auctionId),
      playerEntryId: fixture.players[0]!.id,
      selectionMethod: "manual",
    });
    if (selected.status !== "accepted") throw new Error("selection failed");

    const outcome = await returnActivePlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await currentRevision(fixture.auctionId),
      presentationId: selected.result.presentationId,
      reason: "Selected the wrong Player",
    });

    expect(outcome.status).toBe("accepted");
    const presentation = await pool.query<{
      return_reason: string;
      state: string;
    }>(
      `select "state", "return_reason" from "player_presentation" where "id" = $1`,
      [selected.result.presentationId],
    );
    expect(presentation.rows[0]).toMatchObject({
      return_reason: "Selected the wrong Player",
      state: "returned",
    });

    const audit = await pool.query<{ reason: string }>(
      `select "reason" from "audit_entry"
        where "auction_id" = $1 and "action" = 'return_player'`,
      [fixture.auctionId],
    );
    expect(audit.rows[0]!.reason).toBe("Selected the wrong Player");

    // The returned Player is eligible again.
    expect(await eligibleIds(fixture.auctionId)).toContain(
      fixture.players[0]!.id,
    );
  });

  it("refuses to return a Player that already has a Bid", async () => {
    const fixture = await buildLiveAuction("return-bid");
    const selected = await selectPlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await currentRevision(fixture.auctionId),
      playerEntryId: fixture.players[0]!.id,
      selectionMethod: "manual",
    });
    if (selected.status !== "accepted") throw new Error("selection failed");

    await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await currentRevision(fixture.auctionId),
      presentationId: selected.result.presentationId,
      teamId: fixture.redsTeamId,
    });

    const outcome = await returnActivePlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await currentRevision(fixture.auctionId),
      presentationId: selected.result.presentationId,
      reason: "Change of plan",
    });

    expect(outcome).toMatchObject({ reason: "bid_exists", status: "rejected" });
  });
});
