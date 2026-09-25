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
    if (url && key) {
      try {
        const revision = Math.max(...events.map((event) => event.revision));
        const response = await fetch(
          `${url.replace(/\/$/, "")}/realtime/v1/api/broadcast`,
          {
            method: "POST",
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messages: [
                {
                  topic: auctionBroadcastTopic(auctionId),
                  event: "rev",
                  payload: { revision },
                  private: false,
                },
              ],
            }),
            signal: AbortSignal.timeout(2_000),
          },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        console.warn("Auction revision broadcast failed", error);
      }
    }

    await markOutboxPublished(
      db,
      events.map((event) => event.id),
    );
  } catch (error) {
    console.warn("Auction revision notification failed", error);
  }
}
