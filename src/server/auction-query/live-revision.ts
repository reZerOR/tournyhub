import type { Queryable } from "@/server/database/queryable";

export interface LiveRevision {
  revision: number;
  serverTime: string;
}

/** One authorized revision check for a visible Live or Paused Auction. */
export async function getLiveRevision(
  db: Queryable,
  userId: string,
  auctionId: string,
): Promise<LiveRevision | null> {
  const result = await db.query<{ revision: number; server_time: Date }>(
    `select a."revision", now() as server_time
       from "auction" a
      where a."id" = $1 and a."hidden_at" is null
        and a."status" in ('live', 'paused')
        and (a."organizer_id" = $2 or exists (
          select 1 from "team" t
           where t."auction_id" = a."id"
             and t."representative_user_id" = $2))`,
    [auctionId, userId],
  );
  const row = result.rows[0];
  return row
    ? { revision: row.revision, serverTime: row.server_time.toISOString() }
    : null;
}
