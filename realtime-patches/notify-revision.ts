// -> src/server/realtime/notify-revision.ts
import type { Queryable } from "@/server/database/queryable";
import { auctionBroadcastTopic } from "@/server/realtime/grant";
import {
  markOutboxPublished,
  readPendingOutbox,
} from "@/server/realtime/outbox";

/** The one Broadcast event name clients listen for. */
export const REVISION_EVENT = "rev";

/**
 * Tells connected participants "the Auction is now at revision N" so they pull
 * a fresh snapshot. It is only a nudge: the payload is just the revision, and
 * every client still fetches its own authorized snapshot.
 *
 * Why this replaces CoalescingRealtimeDistributor on Vercel:
 *  - its lastSentAt/pending maps live in one serverless instance, so they do
 *    not coalesce anything across instances;
 *  - its setTimeout flush can be lost when the function is frozen after the
 *    response;
 *  - `void this.send()` is not awaited, so the HTTP call may never finish.
 * Here the send is a single awaited HTTP request, run in parallel with the
 * caller's snapshot load, so it adds no latency. Coalescing now happens on
 * the client (one in-flight pull at a time).
 *
 * Failures never throw: clients also poll slowly as a fallback.
 */
export async function notifyRevision(
  db: Queryable,
  auctionId: string,
): Promise<void> {
  const events = await readPendingOutbox(db, auctionId);
  if (events.length === 0) return;

  const revision = Math.max(...events.map((event) => event.revision));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key) {
    try {
      const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
        body: JSON.stringify({
          messages: [
            {
              event: REVISION_EVENT,
              payload: { revision },
              private: false,
              topic: auctionBroadcastTopic(auctionId),
            },
          ],
        }),
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) {
        console.warn(`Realtime broadcast failed: HTTP ${response.status}`);
      }
    } catch (error) {
      console.warn("Realtime broadcast failed", error);
    }
  }

  await markOutboxPublished(
    db,
    events.map((event) => event.id),
  );
}
