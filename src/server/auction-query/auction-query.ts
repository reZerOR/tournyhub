import type { Pool } from "pg";

import type {
  Auction,
  AuctionStatus,
  CloseMode,
  RulesMode,
} from "@/domain/auction";
import type { Queryable } from "@/server/database/queryable";

interface AuctionRow {
  close_mode: CloseMode;
  created_at: Date;
  game: string;
  id: string;
  organizer_id: string;
  rules_mode: RulesMode;
  status: AuctionStatus;
  title: string;
  updated_at: Date;
}

function mapRow(row: AuctionRow): Auction {
  return {
    closeMode: row.close_mode,
    createdAt: row.created_at,
    game: row.game,
    id: row.id,
    organizerId: row.organizer_id,
    rulesMode: row.rules_mode,
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

/** Every non-archived Auction this User organizes, for the dashboard. */
export async function getOrganizerAuctions(
  pool: Pool,
  organizerId: string,
): Promise<Auction[]> {
  const result = await pool.query<AuctionRow>(
    `select * from "auction"
      where "organizer_id" = $1 and "status" <> 'archived'
      order by "updated_at" desc`,
    [organizerId],
  );
  return result.rows.map(mapRow);
}

/** This User's Archived Auctions, for the dashboard. */
export async function getArchivedAuctions(
  pool: Pool,
  organizerId: string,
): Promise<Auction[]> {
  const result = await pool.query<AuctionRow>(
    `select * from "auction"
      where "organizer_id" = $1 and "status" = 'archived'
      order by "updated_at" desc`,
    [organizerId],
  );
  return result.rows.map(mapRow);
}

/**
 * An authorized snapshot of a Draft Auction. Returns null both when the
 * Auction does not exist and when it belongs to another organizer, so a
 * User cannot discover another User's Auction by guessing an id.
 */
export async function getDraftAuctionForOrganizer(
  pool: Pool,
  organizerId: string,
  auctionId: string,
): Promise<Auction | null> {
  const result = await pool.query<AuctionRow>(
    `select * from "auction"
      where "id" = $1 and "organizer_id" = $2 and "status" = 'draft'`,
    [auctionId, organizerId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/**
 * An authorized snapshot of an Auction whose setup is still editable (Draft
 * or Ready). Returns null for a missing, unrelated, or non-editable Auction.
 */
export async function getEditableAuctionForOrganizer(
  pool: Queryable,
  organizerId: string,
  auctionId: string,
): Promise<Auction | null> {
  const result = await pool.query<AuctionRow>(
    `select * from "auction"
      where "id" = $1 and "organizer_id" = $2 and "status" in ('draft', 'ready')`,
    [auctionId, organizerId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}
