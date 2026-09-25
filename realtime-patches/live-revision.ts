// -> src/server/auction-query/live-revision.ts
import type { Queryable } from "@/server/database/queryable";

export interface LiveRevision {
  revision: number;
  serverTime: string;
}

/**
 * One cheap query answering: may this User open the live console, and what is
 * the Auction's current revision?
 *
 * Mirrors the access rules of getLiveSnapshot + resolveLiveRole (Organizer or
 * current Representative; Auction Live or Paused; not hidden) so a poll that
 * finds nothing new never has to run the ~20 queries of a full snapshot.
 * Returns null for "no access" and "not live" alike, so an unrelated caller
 * cannot learn that a protected Auction exists.
 */
export async function getLiveRevision(
  db: Queryable,
  userId: string,
  auctionId: string,
): Promise<LiveRevision | null> {
  const result = await db.query<{
    allowed: boolean;
    now: Date;
    revision: number;
  }>(
    `select a."revision",
            now() as now,
            (a."organizer_id" = $2
              or exists (select 1 from "team" t
                          where t."auction_id" = a."id"
                            and t."representative_user_id" = $2)) as allowed
       from "auction" a
      where a."id" = $1
        and a."hidden_at" is null
        and a."status" in ('live', 'paused')`,
    [auctionId, userId],
  );
  const row = result.rows[0];
  if (!row || !row.allowed) return null;
  return { revision: row.revision, serverTime: row.now.toISOString() };
}
