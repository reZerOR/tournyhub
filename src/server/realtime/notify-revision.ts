import type { Queryable } from "@/server/database/queryable";
import { auctionBroadcastTopic } from "@/server/realtime/grant";
import {
  markOutboxPublished,
  readPendingOutbox,
} from "@/server/realtime/outbox";

/** Broadcast one committed revision; polling recovers from delivery failures. */
export async function notifyRevision(
  db: Queryable,
  auctionId: string,
): Promise<void> {
  try {
    const events = await readPendingOutbox(db, auctionId);
    if (events.length === 0) return;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // Marking an event published is a promise that it was delivered. A failed
    // POST must leave the row pending so the next attempt retries it; marking it
    // anyway is what reduced a dropped nudge to a 15 s poll.
    let delivered = true;
    if (url && key) {
      delivered = false;
      try {
        const response = await fetch(
          `${url.replace(/\/$/, "")}/realtime/v1/api/broadcast`,
          {
            method: "POST",
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            // Each pending change is broadcast as its own delta. A console that
            // can apply them advances without a snapshot pull; one that cannot,
            // or that misses a message, falls back to the revision pull. The
            // payloads are already public: a rejected Bid never reaches here.
            body: JSON.stringify({
              messages: events.map((event) => ({
                topic: auctionBroadcastTopic(auctionId),
                event: "rev",
                payload: {
                  kind: event.kind,
                  payload: event.payload,
                  revision: event.revision,
                },
                private: false,
              })),
            }),
            signal: AbortSignal.timeout(2_000),
          },
        );
        delivered = response.ok;
        if (!delivered) throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        console.warn("Auction revision broadcast failed", error);
      }
    }

    if (delivered) {
      await markOutboxPublished(
        db,
        events.map((event) => event.id),
      );
    }
  } catch (error) {
    console.warn("Auction revision notification failed", error);
  }
}
