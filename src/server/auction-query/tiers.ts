import type { Tier } from "@/domain/tier";
import { isEditableAuction } from "@/server/auction-query/editable";
import type { Queryable } from "@/server/database/queryable";

export interface TierRow {
  auction_id: string;
  created_at: Date;
  id: string;
  label: string;
  max_per_team: number;
  min_per_team: number;
  normalized_label: string;
  position: number;
  starting_price: number;
  updated_at: Date;
}

export function mapTierRow(row: TierRow): Tier {
  return {
    auctionId: row.auction_id,
    createdAt: row.created_at,
    id: row.id,
    label: row.label,
    maxPerTeam: row.max_per_team,
    minPerTeam: row.min_per_team,
    normalizedLabel: row.normalized_label,
    position: row.position,
    startingPrice: row.starting_price,
    updatedAt: row.updated_at,
  };
}

/** This Auction's Tiers in Organizer order without an authorization check. */
export async function loadTiers(
  db: Queryable,
  auctionId: string,
): Promise<Tier[]> {
  const result = await db.query<TierRow>(
    `select * from "tier"
      where "auction_id" = $1
      order by "position" asc, "created_at" asc, "id" asc`,
    [auctionId],
  );
  return result.rows.map(mapTierRow);
}

/**
 * This Auction's Tiers in Organizer order, or null when the Auction is not
 * editable for this Organizer.
 */
export async function getTiersForOrganizer(
  db: Queryable,
  organizerId: string,
  auctionId: string,
): Promise<null | Tier[]> {
  if (!(await isEditableAuction(db, organizerId, auctionId))) return null;
  return loadTiers(db, auctionId);
}

/** A single Tier row, or null when it is not in this Auction. */
export async function loadTierRow(
  db: Queryable,
  auctionId: string,
  tierId: string,
): Promise<null | TierRow> {
  const result = await db.query<TierRow>(
    `select * from "tier" where "id" = $1 and "auction_id" = $2`,
    [tierId, auctionId],
  );
  return result.rows[0] ?? null;
}
