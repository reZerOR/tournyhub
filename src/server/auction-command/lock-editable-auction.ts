import type { PoolClient } from "pg";

import type { AuctionStatus } from "@/domain/auction";

/** The Auction states in which setup stays editable. */
export type EditableAuctionStatus = "draft" | "ready";

/**
 * Locks the Auction row and confirms it is an editable Draft or Ready Auction
 * owned by this Organizer. Every setup command runs under this lock so
 * concurrent writes for one Auction cannot race its caps, uniqueness rules, or
 * representative authority.
 *
 * Ready is derived: a later setup edit returns the Auction to Draft, so every
 * command that writes calls `markAuctionDraft` before committing.
 */
export async function lockEditableAuction(
  client: PoolClient,
  organizerId: string,
  auctionId: string,
): Promise<EditableAuctionStatus | null> {
  const result = await client.query<{ status: AuctionStatus }>(
    `select "status" from "auction"
      where "id" = $1 and "organizer_id" = $2 and "status" in ('draft', 'ready')
        and "hidden_at" is null
      for update`,
    [auctionId, organizerId],
  );
  const status = result.rows[0]?.status;
  return status === "draft" || status === "ready" ? status : null;
}

/** Returns a Ready Auction to Draft after a setup edit. */
export async function markAuctionDraft(
  client: PoolClient,
  auctionId: string,
): Promise<void> {
  await client.query(
    `update "auction"
        set "status" = 'draft', "updated_at" = now()
      where "id" = $1 and "status" = 'ready'`,
    [auctionId],
  );
}
