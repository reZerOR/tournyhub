import type { Pool } from "pg";

import { evaluateReadiness, type Readiness } from "@/domain/readiness";
import { lockEditableAuction } from "@/server/auction-command/lock-editable-auction";
import { loadReadinessInput } from "@/server/auction-query/readiness";

/**
 * Recomputes Readiness and records it in the Auction's lifecycle: a Draft
 * becomes Ready when every requirement holds, and a Ready Auction returns to
 * Draft when it no longer does. Returns null when the Auction is not editable
 * by this Organizer.
 */
export async function syncAuctionReadiness(
  pool: Pool,
  organizerId: string,
  auctionId: string,
): Promise<null | Readiness> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const status = await lockEditableAuction(client, organizerId, auctionId);
    if (!status) {
      await client.query("rollback");
      return null;
    }

    const input = await loadReadinessInput(client, auctionId);
    const readiness = evaluateReadiness(input);

    if (readiness.ready && status === "draft") {
      await client.query(
        `update "auction"
            set "status" = 'ready', "updated_at" = now()
          where "id" = $1 and "status" = 'draft'`,
        [auctionId],
      );
    } else if (!readiness.ready && status === "ready") {
      await client.query(
        `update "auction"
            set "status" = 'draft', "updated_at" = now()
          where "id" = $1 and "status" = 'ready'`,
        [auctionId],
      );
    }

    await client.query("commit");
    return readiness;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
