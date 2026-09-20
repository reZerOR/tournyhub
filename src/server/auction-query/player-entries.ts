import type { Pool } from "pg";

import type { CustomPlayerField, PlayerEntry } from "@/domain/player-entry";

interface CustomPlayerFieldRow {
  auction_id: string;
  created_at: Date;
  id: string;
  label: string;
  updated_at: Date;
}

interface PlayerEntryRow {
  auction_id: string;
  created_at: Date;
  display_name: string;
  external_player_id: null | string;
  id: string;
  phone_number: null | string;
  role: null | string;
  starting_price_override: null | number;
  updated_at: Date;
}

interface CustomValueRow {
  custom_player_field_id: string;
  player_entry_id: string;
  value: string;
}

function mapCustomPlayerFieldRow(row: CustomPlayerFieldRow): CustomPlayerField {
  return {
    auctionId: row.auction_id,
    createdAt: row.created_at,
    id: row.id,
    label: row.label,
    updatedAt: row.updated_at,
  };
}

function mapPlayerEntryRow(
  row: PlayerEntryRow,
  customValues: Record<string, string>,
): PlayerEntry {
  return {
    auctionId: row.auction_id,
    createdAt: row.created_at,
    customValues,
    displayName: row.display_name,
    externalPlayerId: row.external_player_id,
    id: row.id,
    phoneNumber: row.phone_number,
    role: row.role,
    startingPriceOverride: row.starting_price_override,
    updatedAt: row.updated_at,
  };
}

/**
 * An unrelated Organizer and a missing or non-Draft Auction both produce null
 * so a User cannot confirm another User's Auction exists by its id.
 */
async function isEditableDraftAuction(
  pool: Pool,
  organizerId: string,
  auctionId: string,
): Promise<boolean> {
  const result = await pool.query(
    `select 1 from "auction"
      where "id" = $1 and "organizer_id" = $2 and "status" = 'draft'`,
    [auctionId, organizerId],
  );
  return result.rowCount === 1;
}

/** This Auction's Custom Player Field definitions, or null when it is not an editable Draft for this Organizer. */
export async function getCustomPlayerFieldsForOrganizer(
  pool: Pool,
  organizerId: string,
  auctionId: string,
): Promise<CustomPlayerField[] | null> {
  if (!(await isEditableDraftAuction(pool, organizerId, auctionId))) {
    return null;
  }

  const result = await pool.query<CustomPlayerFieldRow>(
    `select * from "custom_player_field"
      where "auction_id" = $1
      order by "created_at" asc, "id" asc`,
    [auctionId],
  );
  return result.rows.map(mapCustomPlayerFieldRow);
}

/** This Auction's Player Entries with their custom values, or null when it is not an editable Draft for this Organizer. */
export async function getPlayerEntriesForOrganizer(
  pool: Pool,
  organizerId: string,
  auctionId: string,
): Promise<PlayerEntry[] | null> {
  if (!(await isEditableDraftAuction(pool, organizerId, auctionId))) {
    return null;
  }

  const result = await pool.query<PlayerEntryRow>(
    `select * from "player_entry"
      where "auction_id" = $1
      order by "created_at" asc, "id" asc`,
    [auctionId],
  );
  if (result.rows.length === 0) return [];

  const values = await pool.query<CustomValueRow>(
    `select "player_entry_id", "custom_player_field_id", "value"
       from "player_entry_custom_value"
      where "player_entry_id" = any($1::uuid[])`,
    [result.rows.map((row) => row.id)],
  );
  const valuesByEntry = new Map<string, Record<string, string>>();
  for (const row of values.rows) {
    const entryValues = valuesByEntry.get(row.player_entry_id) ?? {};
    entryValues[row.custom_player_field_id] = row.value;
    valuesByEntry.set(row.player_entry_id, entryValues);
  }

  return result.rows.map((row) =>
    mapPlayerEntryRow(row, valuesByEntry.get(row.id) ?? {}),
  );
}
