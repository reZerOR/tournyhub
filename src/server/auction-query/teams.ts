import type { Team } from "@/domain/team";
import { isEditableAuction } from "@/server/auction-query/editable";
import type { Queryable } from "@/server/database/queryable";

export interface TeamRow {
  auction_id: string;
  color: null | string;
  created_at: Date;
  id: string;
  logo_storage_key: null | string;
  name: null | string;
  normalized_name: null | string;
  position: number;
  representative_type: null | string;
  representative_user_id: null | string;
  updated_at: Date;
}

export function mapTeamRow(row: TeamRow): Team {
  return {
    auctionId: row.auction_id,
    color: row.color,
    createdAt: row.created_at,
    id: row.id,
    logoStorageKey: row.logo_storage_key,
    name: row.name,
    normalizedName: row.normalized_name,
    position: row.position,
    representativeType:
      row.representative_type === "player" ||
      row.representative_type === "outside"
        ? row.representative_type
        : null,
    representativeUserId: row.representative_user_id,
    updatedAt: row.updated_at,
  };
}

/** This Auction's Teams in Organizer order, or null when it is not editable for this Organizer. */
export async function getTeamsForOrganizer(
  db: Queryable,
  organizerId: string,
  auctionId: string,
): Promise<null | Team[]> {
  if (!(await isEditableAuction(db, organizerId, auctionId))) return null;

  const result = await db.query<TeamRow>(
    `select * from "team"
      where "auction_id" = $1
      order by "position" asc, "created_at" asc, "id" asc`,
    [auctionId],
  );
  return result.rows.map(mapTeamRow);
}

export interface TeamCountBasis {
  playerCount: number;
  preassignedRepresentativeCount: number;
}

/** A single Team row, or null when it is not in this Auction. */
export async function loadTeamRow(
  db: Queryable,
  auctionId: string,
  teamId: string,
): Promise<null | TeamRow> {
  const result = await db.query<TeamRow>(
    `select * from "team" where "id" = $1 and "auction_id" = $2`,
    [teamId, auctionId],
  );
  return result.rows[0] ?? null;
}

/**
 * The Team logo's storage key for a User who organizes the Auction or
 * represents that Team. An unrelated User learns nothing about the Team.
 */
export async function getTeamLogoKeyForUser(
  db: Queryable,
  userId: string,
  auctionId: string,
  teamId: string,
): Promise<null | string> {
  const result = await db.query<{ logo_storage_key: null | string }>(
    `select t."logo_storage_key"
       from "team" t
       join "auction" a on a."id" = t."auction_id"
      where t."id" = $1 and t."auction_id" = $2
        and (a."organizer_id" = $3 or t."representative_user_id" = $3)`,
    [teamId, auctionId, userId],
  );
  return result.rows[0]?.logo_storage_key ?? null;
}

/**
 * The counts the Team calculator needs: every Player Entry in the Auction and
 * how many are already preassigned Player Representatives.
 */
export async function getTeamCountBasisForOrganizer(
  db: Queryable,
  organizerId: string,
  auctionId: string,
): Promise<null | TeamCountBasis> {
  if (!(await isEditableAuction(db, organizerId, auctionId))) return null;

  const result = await db.query<{
    player_count: number;
    representative_count: number;
  }>(
    `select count(*)::int as player_count,
            count(*) filter (where "is_representative")::int as representative_count
       from "player_entry"
      where "auction_id" = $1`,
    [auctionId],
  );
  const row = result.rows[0]!;
  return {
    playerCount: row.player_count,
    preassignedRepresentativeCount: row.representative_count,
  };
}
