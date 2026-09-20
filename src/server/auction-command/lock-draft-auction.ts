import type { PoolClient } from "pg";

/**
 * Locks the Auction row and confirms it is a Draft still owned by this
 * Organizer. Every Draft setup command runs under this lock so concurrent
 * writes for one Auction cannot race the entry, field, or import caps.
 */
export async function lockDraftAuction(
  client: PoolClient,
  organizerId: string,
  auctionId: string,
): Promise<boolean> {
  const result = await client.query(
    `select "id" from "auction"
      where "id" = $1 and "organizer_id" = $2 and "status" = 'draft'
      for update`,
    [auctionId, organizerId],
  );
  return result.rowCount === 1;
}
