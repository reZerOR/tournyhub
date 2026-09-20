import type { Pool, PoolClient } from "pg";

import {
  ARCHIVE_RETENTION_DAYS,
  archiveWindowClosed,
  isArchivable,
} from "@/domain/lifecycle";

/** An archive action the Organizer can act on, as opposed to an unexpected failure. */
export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveError";
  }
}

export interface ArchiveResult {
  archiveDeadline: string;
  previousStatus: string;
}

interface LockedAuction {
  archive_deadline: Date | null;
  archived_previous_status: null | string;
  status: string;
}

async function lockOwnedAuction(
  client: PoolClient,
  organizerId: string,
  auctionId: string,
): Promise<LockedAuction | null> {
  const result = await client.query<LockedAuction>(
    `select "status", "archived_previous_status", "archive_deadline"
       from "auction"
      where "id" = $1 and "organizer_id" = $2
      for update`,
    [auctionId, organizerId],
  );
  return result.rows[0] ?? null;
}

/**
 * Archives an Auction the Organizer owns. A Draft, Ready, Completed, or
 * Cancelled Auction may be archived; a Live or Paused one may not, so an
 * Archived Auction can never restore into bidding.
 *
 * Returns null when the Auction does not exist or belongs to another Organizer,
 * so callers cannot confirm someone else's Auction by guessing an id.
 */
export async function archiveAuction(
  pool: Pool,
  organizerId: string,
  auctionId: string,
): Promise<ArchiveResult | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const auction = await lockOwnedAuction(client, organizerId, auctionId);
    if (!auction) {
      await client.query("rollback");
      return null;
    }
    if (!isArchivable(auction.status)) {
      await client.query("rollback");
      throw new ArchiveError(
        "Only a Draft, Ready, Completed, or Cancelled Auction can be archived.",
      );
    }

    const updated = await client.query<{ archive_deadline: Date }>(
      `update "auction"
          set "status" = 'archived',
              "archived_at" = now(),
              "archived_previous_status" = $2,
              "archive_deadline" = now() + ($3 || ' days')::interval,
              "updated_at" = now()
        where "id" = $1
        returning "archive_deadline"`,
      [auctionId, auction.status, String(ARCHIVE_RETENTION_DAYS)],
    );
    await client.query("commit");
    return {
      archiveDeadline: updated.rows[0]!.archive_deadline.toISOString(),
      previousStatus: auction.status,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export interface RestoreResult {
  status: string;
}

/**
 * Restores an Archived Auction to the state it was archived from, inside the
 * seven-day recovery window. Once the window has closed the Auction is eligible
 * for permanent deletion and can no longer be restored.
 */
export async function restoreAuction(
  pool: Pool,
  organizerId: string,
  auctionId: string,
): Promise<null | RestoreResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const auction = await lockOwnedAuction(client, organizerId, auctionId);
    if (!auction) {
      await client.query("rollback");
      return null;
    }
    if (auction.status !== "archived" || !auction.archived_previous_status) {
      await client.query("rollback");
      throw new ArchiveError("This Auction is not archived.");
    }

    // Database time decides the boundary, never a browser clock.
    const now = await client.query<{ now: Date }>(`select now() as now`);
    if (
      auction.archive_deadline &&
      archiveWindowClosed(auction.archive_deadline, now.rows[0]!.now)
    ) {
      await client.query("rollback");
      throw new ArchiveError(
        "This Auction's recovery window has closed, so it can no longer be restored.",
      );
    }

    await client.query(
      `update "auction"
          set "status" = $2,
              "archived_at" = null,
              "archived_previous_status" = null,
              "archive_deadline" = null,
              "updated_at" = now()
        where "id" = $1`,
      [auctionId, auction.archived_previous_status],
    );
    await client.query("commit");
    return { status: auction.archived_previous_status };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Permanently deletes every Archived Auction whose recovery window has closed.
 * It is idempotent: a repeat run deletes nothing, and an Auction restored in
 * time is no longer Archived so it is never touched. There is no reminder
 * email, matching the first version's simple retention rule.
 */
export async function purgeExpiredArchivedAuctions(
  pool: Pool,
  now: Date = new Date(),
): Promise<number> {
  const result = await pool.query(
    `delete from "auction"
      where "status" = 'archived' and "archive_deadline" <= $1`,
    [now],
  );
  return result.rowCount ?? 0;
}
