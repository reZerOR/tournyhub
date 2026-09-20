import type { PoolClient } from "pg";

import type { AuctionStatus, CloseMode, RulesMode } from "@/domain/auction";
import type { Queryable } from "@/server/database/queryable";

/**
 * The uniform result of a live command. A rejected command carries a stable
 * reason code and a safe current revision; an unauthorized caller learns
 * nothing about the Auction.
 */
export type LiveCommandOutcome<T> =
  | { result: T; revision: number; status: "accepted" }
  | { result: T; revision: number; status: "replayed" }
  | { message: string; reason: string; revision: number; status: "rejected" }
  | { status: "unauthorized" };

/** The Auction state a live command locks before it runs. */
export interface LockedLiveAuction {
  activeTierId: null | string;
  closeMode: CloseMode;
  organizerId: string;
  revision: number;
  rulesMode: RulesMode;
  status: AuctionStatus;
}

/**
 * Locks the Auction command row. Every live command serializes on this row, so
 * simultaneous Bids, duplicate finalizers, and competing corrections cannot
 * interleave. PostgreSQL remains the only source of truth for ordering.
 */
export async function lockLiveAuction(
  client: PoolClient,
  auctionId: string,
): Promise<LockedLiveAuction | null> {
  const result = await client.query<{
    active_tier_id: null | string;
    close_mode: CloseMode;
    organizer_id: string;
    revision: number;
    rules_mode: RulesMode;
    status: AuctionStatus;
  }>(
    `select "status", "revision", "rules_mode", "close_mode", "active_tier_id",
            "organizer_id"
       from "auction" where "id" = $1 for update`,
    [auctionId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    activeTierId: row.active_tier_id,
    closeMode: row.close_mode,
    organizerId: row.organizer_id,
    revision: row.revision,
    rulesMode: row.rules_mode,
    status: row.status,
  };
}

export interface StoredCommand<T> {
  actorUserId: null | string;
  result: T;
}

/** A rejected live command with a stable reason code and a safe revision. */
export function rejection<T>(
  message: string,
  reason: string,
  revision: number,
): LiveCommandOutcome<T> {
  return { message, reason, revision, status: "rejected" };
}

/** The originally stored result for a command ID, or null when it is new. */
export async function findStoredCommand<T>(
  client: PoolClient,
  auctionId: string,
  commandId: string,
): Promise<null | StoredCommand<T>> {
  const result = await client.query<{
    actor_user_id: null | string;
    result: T;
  }>(
    `select "actor_user_id", "result" from "auction_command"
      where "auction_id" = $1 and "command_id" = $2`,
    [auctionId, commandId],
  );
  const row = result.rows[0];
  return row ? { actorUserId: row.actor_user_id, result: row.result } : null;
}

/** Records a command's result so a duplicate command ID can replay it. */
export async function storeCommand<T>(
  client: PoolClient,
  {
    actorUserId,
    auctionId,
    commandId,
    kind,
    result,
  }: {
    actorUserId: string;
    auctionId: string;
    commandId: string;
    kind: string;
    result: T;
  },
): Promise<void> {
  await client.query(
    `insert into "auction_command"
        ("auction_id", "command_id", "actor_user_id", "kind", "result")
     values ($1, $2, $3, $4, $5::jsonb)`,
    [auctionId, commandId, actorUserId, kind, JSON.stringify(result)],
  );
}

/**
 * Advances the monotonic Auction revision and records the committed change in
 * the outbox. Every shared state change has exactly one revision and one
 * outbox event.
 */
export async function bumpRevision(
  client: PoolClient,
  auctionId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const updated = await client.query<{ revision: number }>(
    `update "auction" set "revision" = "revision" + 1, "updated_at" = now()
      where "id" = $1
      returning "revision"`,
    [auctionId],
  );
  const revision = updated.rows[0]!.revision;
  await client.query(
    `insert into "auction_outbox_event" ("auction_id", "revision", "kind", "payload")
     values ($1, $2, $3, $4::jsonb)`,
    [auctionId, revision, kind, JSON.stringify(payload)],
  );
  return revision;
}

/** Writes an immutable Audit Entry for a fairness-affecting action. */
export async function writeAuditEntry(
  client: Queryable,
  {
    action,
    actorUserId,
    auctionId,
    details = {},
    reason = null,
  }: {
    action: string;
    actorUserId: null | string;
    auctionId: string;
    details?: Record<string, unknown>;
    reason?: null | string;
  },
): Promise<void> {
  await client.query(
    `insert into "audit_entry"
        ("auction_id", "actor_user_id", "action", "reason", "details")
     values ($1, $2, $3, $4, $5::jsonb)`,
    [auctionId, actorUserId, action, reason, JSON.stringify(details)],
  );
}
