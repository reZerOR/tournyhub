import type { Queryable } from "@/server/database/queryable";
import type {
  CoalescingRealtimeDistributor,
  RealtimeEvent,
} from "@/server/realtime/distributor";

export interface OutboxEvent {
  auctionId: string;
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  revision: number;
}

interface OutboxRow {
  auction_id: string;
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  revision: number;
}

/** The committed changes still waiting to be distributed, oldest first. */
export async function readPendingOutbox(
  db: Queryable,
  auctionId: string,
  limit = 200,
): Promise<OutboxEvent[]> {
  const result = await db.query<OutboxRow>(
    `select "id", "auction_id", "revision", "kind", "payload"
       from "auction_outbox_event"
      where "auction_id" = $1 and "published_at" is null
      order by "id" asc
      limit $2`,
    [auctionId, limit],
  );
  return result.rows.map((row) => ({
    auctionId: row.auction_id,
    id: row.id,
    kind: row.kind,
    payload: row.payload,
    revision: row.revision,
  }));
}

/** Marks the given outbox events as distributed. */
export async function markOutboxPublished(
  db: Queryable,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await db.query(
    `update "auction_outbox_event" set "published_at" = now()
      where "id" = any($1::bigint[])`,
    [ids],
  );
}

/**
 * Distributes every pending committed change through the coalescing
 * distributor and marks it published. Realtime is only a notification path:
 * the payloads here never carry authorization decisions, phone numbers, or
 * service credentials.
 */
export async function publishPendingOutbox(
  db: Queryable,
  auctionId: string,
  distributor: CoalescingRealtimeDistributor,
): Promise<number> {
  const events = await readPendingOutbox(db, auctionId);
  if (events.length === 0) return 0;

  for (const event of events) {
    const realtimeEvent: RealtimeEvent = {
      auctionId: event.auctionId,
      kind: event.kind,
      payload: event.payload,
      revision: event.revision,
    };
    distributor.publish(realtimeEvent);
  }
  await markOutboxPublished(
    db,
    events.map((event) => event.id),
  );
  return events.length;
}
