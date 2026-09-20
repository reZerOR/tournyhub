import type { Queryable } from "@/server/database/queryable";

/** True when this User holds the allowlisted Platform Administrator role. */
export async function isPlatformAdministrator(
  db: Queryable,
  userId: string,
): Promise<boolean> {
  const result = await db.query(
    `select 1 from "platform_administrator" where "user_id" = $1`,
    [userId],
  );
  return result.rowCount === 1;
}

/**
 * True when this User is currently suspended: a suspension exists that has not
 * been restored. Session reads and every protected action consult this.
 */
export async function isUserSuspended(
  db: Queryable,
  userId: string,
): Promise<boolean> {
  const result = await db.query(
    `select 1 from "user_suspension"
      where "user_id" = $1 and "restored_at" is null`,
    [userId],
  );
  return result.rowCount === 1;
}

export interface AdminUserRow {
  createdAt: Date;
  email: string;
  id: string;
  name: string;
  suspended: boolean;
}

/** Users for the administration list, optionally filtered by email or name. */
export async function listUsersForAdministrator(
  db: Queryable,
  query: string,
  limit = 50,
): Promise<AdminUserRow[]> {
  const trimmed = query.trim();
  const result = await db.query<{
    createdat: Date;
    email: string;
    id: string;
    name: string;
    suspended: boolean;
  }>(
    `select u."id", u."name", u."email", u."createdAt" as createdat,
            exists (
              select 1 from "user_suspension" s
               where s."user_id" = u."id" and s."restored_at" is null
            ) as suspended
       from "user" u
      where $1 = '' or u."email" ilike '%' || $1 || '%'
         or u."name" ilike '%' || $1 || '%'
      order by u."createdAt" desc
      limit $2`,
    [trimmed, limit],
  );
  return result.rows.map((row) => ({
    createdAt: row.createdat,
    email: row.email,
    id: row.id,
    name: row.name,
    suspended: row.suspended,
  }));
}

export interface AdminAuctionRow {
  hidden: boolean;
  id: string;
  organizerEmail: null | string;
  status: string;
  title: string;
}

/** Auctions for the administration list, optionally filtered by title. */
export async function listAuctionsForAdministrator(
  db: Queryable,
  query: string,
  limit = 50,
): Promise<AdminAuctionRow[]> {
  const trimmed = query.trim();
  const result = await db.query<{
    hidden_at: Date | null;
    id: string;
    organizer_email: null | string;
    status: string;
    title: string;
  }>(
    `select a."id", a."title", a."status", a."hidden_at",
            u."email" as organizer_email
       from "auction" a
       left join "user" u on u."id" = a."organizer_id"
      where $1 = '' or a."title" ilike '%' || $1 || '%'
      order by a."updated_at" desc
      limit $2`,
    [trimmed, limit],
  );
  return result.rows.map((row) => ({
    hidden: row.hidden_at !== null,
    id: row.id,
    organizerEmail: row.organizer_email,
    status: row.status,
    title: row.title,
  }));
}

export interface ModerationSummary {
  auction: {
    hidden: boolean;
    id: string;
    organizerEmail: null | string;
    revision: number;
    rulesMode: string;
    status: string;
    title: string;
  };
  counts: {
    audits: number;
    bids: number;
    players: number;
    sales: number;
    teams: number;
  };
  /** The moderation accesses already recorded for this Auction. */
  accessHistory: { action: string; at: Date; reason: string }[];
}

/**
 * The read-only summary an administrator sees after entering a reason. It names
 * counts and lifecycle only; no Roster, price, phone number, or credential is
 * included, so an inspection cannot become a data export.
 */
export async function loadModerationSummary(
  db: Queryable,
  auctionId: string,
): Promise<ModerationSummary | null> {
  const auction = await db.query<{
    hidden_at: Date | null;
    id: string;
    organizer_email: null | string;
    revision: number;
    rules_mode: string;
    status: string;
    title: string;
  }>(
    `select a."id", a."title", a."status", a."revision", a."rules_mode",
            a."hidden_at", u."email" as organizer_email
       from "auction" a
       left join "user" u on u."id" = a."organizer_id"
      where a."id" = $1`,
    [auctionId],
  );
  const row = auction.rows[0];
  if (!row) return null;

  const counts = await db.query<{
    audits: number;
    bids: number;
    players: number;
    sales: number;
    teams: number;
  }>(
    `select
       (select count(*)::int from "team" where "auction_id" = $1) as teams,
       (select count(*)::int from "player_entry" where "auction_id" = $1) as players,
       (select count(*)::int from "bid_attempt" where "auction_id" = $1) as bids,
       (select count(*)::int from "sale" where "auction_id" = $1) as sales,
       (select count(*)::int from "audit_entry" where "auction_id" = $1) as audits`,
    [auctionId],
  );

  const history = await db.query<{
    action: string;
    reason: string;
    server_time: Date;
  }>(
    `select "action", "reason", "server_time" from "moderation_access_entry"
      where "auction_id" = $1 order by "server_time" desc limit 20`,
    [auctionId],
  );

  return {
    accessHistory: history.rows.map((entry) => ({
      action: entry.action,
      at: entry.server_time,
      reason: entry.reason,
    })),
    auction: {
      hidden: row.hidden_at !== null,
      id: row.id,
      organizerEmail: row.organizer_email,
      revision: row.revision,
      rulesMode: row.rules_mode,
      status: row.status,
      title: row.title,
    },
    counts: counts.rows[0]!,
  };
}
