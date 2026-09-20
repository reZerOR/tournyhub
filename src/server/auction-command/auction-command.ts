import type { Pool } from "pg";

import {
  auctionBasicsSchema,
  type Auction,
  type AuctionBasicsInput,
  type AuctionStatus,
  type CloseMode,
  type RulesMode,
} from "@/domain/auction";

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

/** Creates the Draft Auction a User organizes. This is the entry point into the Auction Command seam described in ADR-0009. */
export async function createDraftAuction(
  pool: Pool,
  organizerId: string,
  input: AuctionBasicsInput,
): Promise<Auction> {
  const basics = auctionBasicsSchema.parse(input);
  const result = await pool.query<AuctionRow>(
    `insert into "auction"
        ("organizer_id", "title", "game", "rules_mode", "close_mode", "status")
     values ($1, $2, $3, $4, $5, 'draft')
     returning *`,
    [
      organizerId,
      basics.title,
      basics.game,
      basics.rulesMode,
      basics.closeMode,
    ],
  );
  return mapRow(result.rows[0]!);
}

/**
 * Saves autosaved Basics edits. Returns null, rather than throwing, when the
 * Auction is not a Draft owned by this organizer so callers cannot use the
 * response to distinguish "not found" from "not yours".
 */
export async function updateDraftAuctionBasics(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  input: AuctionBasicsInput,
): Promise<Auction | null> {
  const basics = auctionBasicsSchema.parse(input);
  const result = await pool.query<AuctionRow>(
    `update "auction"
        set "title" = $3,
            "game" = $4,
            "rules_mode" = $5,
            "close_mode" = $6,
            "updated_at" = now()
      where "id" = $1 and "organizer_id" = $2 and "status" = 'draft'
      returning *`,
    [
      auctionId,
      organizerId,
      basics.title,
      basics.game,
      basics.rulesMode,
      basics.closeMode,
    ],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}
