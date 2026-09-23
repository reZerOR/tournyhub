import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlayerEntry } from "@/server/auction-command/player-entries";
import { createTeam } from "@/server/auction-command/teams";
import { assignPlayerTier, createTier } from "@/server/auction-command/tiers";
import { getLiveSnapshot } from "@/server/auction-query/live-snapshot";
import { createTestAuction, createTestUser, pool } from "./support";

let db: PoolClient | undefined;
let auctionId: string;
let organizerId: string;
let representativeId: string;
let teamId: string;
let playerId: string;
let secondTierId: string;
const userIds: string[] = [];

beforeEach(async () => {
  organizerId = await createTestUser("directory-organizer");
  userIds.push(organizerId);
  representativeId = await createTestUser("directory-representative");
  userIds.push(representativeId);
  auctionId = (await createTestAuction(organizerId, { rulesMode: "tiered" }))
    .id;
  teamId = (await createTeam(pool, organizerId, auctionId, { name: "Reds" }))!
    .id;
  const firstTier = (await createTier(pool, organizerId, auctionId, {
    label: "Bronze",
    minPerTeam: 0,
    maxPerTeam: 3,
    startingPrice: 10,
  }))!;
  const secondTier = (await createTier(pool, organizerId, auctionId, {
    label: "Gold",
    minPerTeam: 0,
    maxPerTeam: 3,
    startingPrice: 20,
  }))!;
  secondTierId = secondTier.id;
  playerId = (await createPlayerEntry(pool, organizerId, auctionId, {
    displayName: "Bronze Player",
    phoneNumber: "+15551234567",
  }))!.id;
  await assignPlayerTier(pool, organizerId, auctionId, playerId, firstTier.id);
  const waiting = (await createPlayerEntry(pool, organizerId, auctionId, {
    displayName: "Gold Player",
  }))!;
  await assignPlayerTier(
    pool,
    organizerId,
    auctionId,
    waiting.id,
    secondTier.id,
  );
  const rep = (await createPlayerEntry(pool, organizerId, auctionId, {
    displayName: "Red Rep",
  }))!;

  // Uncommitted read-model fixtures never use or reset the beta live slot.
  db = await pool.connect();
  await db.query("begin");
  await db.query(
    `update "team" set "representative_user_id" = $2, "representative_type" = 'player' where "id" = $1`,
    [teamId, representativeId],
  );
  await db.query(
    `update "player_entry" set "is_representative" = true, "team_id" = $2 where "id" = $1`,
    [rep.id, teamId],
  );
  await db.query(
    `update "auction" set "status" = 'paused', "active_tier_id" = $2 where "id" = $1`,
    [auctionId, firstTier.id],
  );
});

afterEach(async () => {
  if (db) {
    await db.query("rollback");
    db.release();
    db = undefined;
  }
  // Only these test Users and their cascading Draft fixtures.
  if (userIds.length)
    await pool.query(`delete from "user" where "id" = any($1::text[])`, [
      [...userIds],
    ]);
  userIds.length = 0;
});

async function player() {
  return (await getLiveSnapshot(
    db!,
    representativeId,
    auctionId,
  ))!.snapshot.players.find((p) => p.id === playerId)!;
}

describe("authorized live player directory", () => {
  it("shows unopened tiers and Representatives identically to both roles without contacts", async () => {
    const organizer = await getLiveSnapshot(db!, organizerId, auctionId);
    const representative = await getLiveSnapshot(
      db!,
      representativeId,
      auctionId,
    );
    const players = organizer!.snapshot.players;
    expect(representative!.snapshot.players).toEqual(players);
    expect(players).toHaveLength(3);
    expect(players.filter((p) => p.status === "waiting")).toHaveLength(2);
    expect(players.find((p) => p.tierId === secondTierId)?.status).toBe(
      "waiting",
    );
    expect(players.find((p) => p.displayName === "Red Rep")).toMatchObject({
      status: "preassigned",
      teamId,
      amount: null,
    });
    expect(Object.keys(players[0]!).sort()).toEqual([
      "amount",
      "displayName",
      "id",
      "status",
      "teamId",
      "tierId",
    ]);
    expect(JSON.stringify(players)).not.toContain("+15551234567");
  });

  it("reads sales, forced assignments, reversals, reoffers and Final Unsold without stale team ownership", async () => {
    expect(await player()).toMatchObject({ status: "waiting", teamId: null });
    const presentationId = randomUUID();
    await db!.query(
      `insert into "player_presentation" ("id", "auction_id", "player_entry_id", "starting_price", "selection_method", "state", "close_mode") values ($1, $2, $3, 10, 'manual', 'open', 'manual')`,
      [presentationId, auctionId, playerId],
    );
    expect(await player()).toMatchObject({
      status: "active",
      teamId: null,
      amount: null,
    });
    await db!.query(
      `update "player_presentation" set "state" = 'sold' where "id" = $1`,
      [presentationId],
    );
    const saleId = randomUUID();
    await db!.query(
      `insert into "sale" ("id", "auction_id", "presentation_id", "player_entry_id", "team_id", "amount", "source") values ($1, $2, $3, $4, $5, 10, 'bid')`,
      [saleId, auctionId, presentationId, playerId, teamId],
    );
    expect(await player()).toMatchObject({
      status: "sold",
      teamId,
      amount: 10,
    });
    await db!.query(`update "sale" set "source" = 'forced' where "id" = $1`, [
      saleId,
    ]);
    expect(await player()).toMatchObject({
      status: "forced",
      teamId,
      amount: 10,
    });
    await db!.query(
      `update "sale" set "reversed_at" = now(), "reversed_reason" = 'Test correction' where "id" = $1`,
      [saleId],
    );
    await db!.query(
      `update "player_presentation" set "state" = 'unsold' where "id" = $1`,
      [presentationId],
    );
    await db!.query(
      `insert into "unsold_membership" ("player_entry_id", "auction_id", "presentation_id") values ($1, $2, $3)`,
      [playerId, auctionId, presentationId],
    );
    expect(await player()).toMatchObject({
      status: "unsold",
      teamId: null,
      amount: null,
    });
    await db!.query(
      `update "player_presentation" set "state" = 'open' where "id" = $1`,
      [presentationId],
    );
    expect(await player()).toMatchObject({ status: "active", teamId: null });
    await db!.query(
      `update "player_presentation" set "state" = 'unsold' where "id" = $1`,
      [presentationId],
    );
    await db!.query(
      `update "unsold_membership" set "resolution" = 'final_unsold', "resolved_at" = now() where "player_entry_id" = $1`,
      [playerId],
    );
    expect(await player()).toMatchObject({
      status: "final_unsold",
      teamId: null,
      amount: null,
    });
  });

  it("keeps the directory behind participant and lifecycle authorization", async () => {
    expect(await getLiveSnapshot(db!, randomUUID(), auctionId)).toBeNull();
    await db!.query(
      `update "team" set "representative_user_id" = null where "id" = $1`,
      [teamId],
    );
    expect(await getLiveSnapshot(db!, representativeId, auctionId)).toBeNull();
    await db!.query(
      `update "auction" set "status" = 'completed' where "id" = $1`,
      [auctionId],
    );
    expect(await getLiveSnapshot(db!, organizerId, auctionId)).toBeNull();
  });
});
