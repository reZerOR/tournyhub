import type { Auction, CloseMode, RulesMode } from "@/domain/auction";
import type { Queryable } from "@/server/database/queryable";

export interface CopySourceOption {
  game: string;
  id: string;
  playerCount: number;
  rulesMode: RulesMode;
  status: string;
  title: string;
}

/**
 * The Auctions this Organizer may copy from: every Auction they own that is not
 * Archived, newest first. The list names the source's Player count so the
 * Organizer knows what is available to select.
 */
export async function getCopySourcesForOrganizer(
  db: Queryable,
  organizerId: string,
): Promise<CopySourceOption[]> {
  const result = await db.query<{
    game: string;
    id: string;
    player_count: number;
    rules_mode: RulesMode;
    status: string;
    title: string;
  }>(
    `select a."id", a."title", a."game", a."rules_mode", a."status",
            (select count(*)::int from "player_entry" pe
              where pe."auction_id" = a."id") as player_count
       from "auction" a
      where a."organizer_id" = $1 and a."status" <> 'archived'
        and a."hidden_at" is null
      order by a."updated_at" desc
      limit 50`,
    [organizerId],
  );
  return result.rows.map((row) => ({
    game: row.game,
    id: row.id,
    playerCount: row.player_count,
    rulesMode: row.rules_mode,
    status: row.status,
    title: row.title,
  }));
}

export interface CopySourceDetail {
  auctionId: string;
  players: {
    displayName: string;
    hasStartingPriceOverride: boolean;
    hasTier: boolean;
    id: string;
  }[];
  rulesMode: RulesMode;
  tiers: { id: string; label: string }[];
  title: string;
}

/**
 * The selectable contents of one copy source, or null when the Auction is not
 * this Organizer's or is Archived.
 */
export async function getCopySourceForOrganizer(
  db: Queryable,
  organizerId: string,
  sourceAuctionId: string,
): Promise<CopySourceDetail | null> {
  const auction = await db.query<{
    rules_mode: RulesMode;
    status: string;
    title: string;
  }>(
    `select "title", "rules_mode", "status" from "auction"
      where "id" = $1 and "organizer_id" = $2 and "hidden_at" is null`,
    [sourceAuctionId, organizerId],
  );
  const row = auction.rows[0];
  if (!row || row.status === "archived") return null;

  const players = await db.query<{
    display_name: string;
    id: string;
    starting_price_override: null | number;
    tier_id: null | string;
  }>(
    `select "id", "display_name", "tier_id", "starting_price_override"
       from "player_entry"
      where "auction_id" = $1
      order by "created_at" asc, "id" asc`,
    [sourceAuctionId],
  );
  const tiers = await db.query<{ id: string; label: string }>(
    `select "id", "label" from "tier" where "auction_id" = $1
      order by "position" asc`,
    [sourceAuctionId],
  );

  return {
    auctionId: sourceAuctionId,
    players: players.rows.map((player) => ({
      displayName: player.display_name,
      hasStartingPriceOverride: player.starting_price_override !== null,
      hasTier: player.tier_id !== null,
      id: player.id,
    })),
    rulesMode: row.rules_mode,
    tiers: tiers.rows,
    title: row.title,
  };
}

export interface ArchivedAuctionView {
  archiveDeadline: Date;
  auction: Auction;
  previousStatus: string;
}

interface AuctionRow {
  archive_deadline: Date;
  archived_previous_status: string;
  close_mode: CloseMode;
  created_at: Date;
  game: string;
  id: string;
  organizer_id: string;
  rules_mode: RulesMode;
  status: string;
  title: string;
  updated_at: Date;
}

/**
 * This Organizer's Archived Auctions with their recovery deadlines, so the
 * dashboard can show how long each one remains recoverable.
 */
export async function getArchivedAuctionViewsForOrganizer(
  db: Queryable,
  organizerId: string,
): Promise<ArchivedAuctionView[]> {
  const result = await db.query<AuctionRow>(
    `select * from "auction"
      where "organizer_id" = $1 and "status" = 'archived'
        and "hidden_at" is null
      order by "archive_deadline" asc`,
    [organizerId],
  );
  return result.rows.map((row) => ({
    archiveDeadline: row.archive_deadline,
    auction: {
      closeMode: row.close_mode,
      createdAt: row.created_at,
      game: row.game,
      id: row.id,
      organizerId: row.organizer_id,
      rulesMode: row.rules_mode,
      status: "archived",
      title: row.title,
      updatedAt: row.updated_at,
    },
    previousStatus: row.archived_previous_status,
  }));
}
