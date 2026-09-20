import type { Queryable } from "@/server/database/queryable";

/**
 * True when the Auction exists, is owned by this Organizer, is still editable
 * (Draft or Ready), and is not hidden by a Platform Administrator. An unrelated
 * Organizer and a missing, hidden, or non-editable Auction are
 * indistinguishable to the caller, so a User cannot confirm another User's
 * Auction exists by its id.
 */
export async function isEditableAuction(
  db: Queryable,
  organizerId: string,
  auctionId: string,
): Promise<boolean> {
  const result = await db.query(
    `select 1 from "auction"
      where "id" = $1 and "organizer_id" = $2 and "status" in ('draft', 'ready')
        and "hidden_at" is null`,
    [auctionId, organizerId],
  );
  return result.rowCount === 1;
}
