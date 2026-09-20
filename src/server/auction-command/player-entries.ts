import type { Pool, PoolClient } from "pg";

import {
  lockEditableAuction,
  markAuctionDraft,
} from "@/server/auction-command/lock-editable-auction";
import {
  customPlayerFieldInputSchema,
  PLAYER_ENTRY_LIMITS,
  playerEntryInputSchema,
  type CustomPlayerField,
  type CustomPlayerFieldInput,
  type PlayerEntry,
  type PlayerEntryInput,
} from "@/domain/player-entry";

/**
 * A Player setup rule the Organizer can repair, as opposed to an unexpected
 * failure. Server actions surface its message directly.
 */
export class PlayerSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerSetupError";
  }
}

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
  is_representative: boolean;
  phone_number: null | string;
  role: null | string;
  starting_price_override: null | number;
  team_id: null | string;
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
    isRepresentative: row.is_representative,
    phoneNumber: row.phone_number,
    role: row.role,
    startingPriceOverride: row.starting_price_override,
    teamId: row.team_id,
    updatedAt: row.updated_at,
  };
}

async function assertCustomFieldsBelongToAuction(
  client: PoolClient,
  auctionId: string,
  fieldIds: string[],
): Promise<void> {
  if (fieldIds.length === 0) return;

  const result = await client.query(
    `select "id" from "custom_player_field"
      where "auction_id" = $1 and "id" = any($2::uuid[])`,
    [auctionId, fieldIds],
  );
  if (result.rowCount !== fieldIds.length) {
    throw new PlayerSetupError(
      "A custom value refers to a field that does not belong to this Auction.",
    );
  }
}

async function replaceCustomValues(
  client: PoolClient,
  playerEntryId: string,
  values: Record<string, string>,
): Promise<void> {
  await client.query(
    `delete from "player_entry_custom_value" where "player_entry_id" = $1`,
    [playerEntryId],
  );

  for (const [customPlayerFieldId, rawValue] of Object.entries(values)) {
    const value = rawValue.trim();
    if (value.length === 0) continue;
    await client.query(
      `insert into "player_entry_custom_value"
          ("player_entry_id", "custom_player_field_id", "value")
       values ($1, $2, $3)`,
      [playerEntryId, customPlayerFieldId, value],
    );
  }
}

async function loadCustomValues(
  client: PoolClient,
  playerEntryIds: string[],
): Promise<Map<string, Record<string, string>>> {
  const valuesByEntry = new Map<string, Record<string, string>>();
  if (playerEntryIds.length === 0) return valuesByEntry;

  const result = await client.query<CustomValueRow>(
    `select "player_entry_id", "custom_player_field_id", "value"
       from "player_entry_custom_value"
      where "player_entry_id" = any($1::uuid[])`,
    [playerEntryIds],
  );
  for (const row of result.rows) {
    const values = valuesByEntry.get(row.player_entry_id) ?? {};
    values[row.custom_player_field_id] = row.value;
    valuesByEntry.set(row.player_entry_id, values);
  }
  return valuesByEntry;
}

async function assertExternalPlayerIdIsFree(
  client: PoolClient,
  auctionId: string,
  externalPlayerId: null | string,
  exceptPlayerEntryId?: string,
): Promise<void> {
  if (!externalPlayerId) return;

  const result = await client.query(
    `select "id" from "player_entry"
      where "auction_id" = $1 and "external_player_id" = $2
        and ($3::uuid is null or "id" <> $3)`,
    [auctionId, externalPlayerId, exceptPlayerEntryId ?? null],
  );
  if (result.rowCount && result.rowCount > 0) {
    throw new PlayerSetupError(
      "Another Player Entry already uses that External Player ID.",
    );
  }
}

/**
 * Adds a Player Entry to a Draft Auction. Returns null when the Auction is not
 * a Draft owned by this Organizer so callers cannot tell "missing" from "not
 * yours".
 */
export async function createPlayerEntry(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  input: PlayerEntryInput,
): Promise<PlayerEntry | null> {
  const entry = playerEntryInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }

    const count = await client.query<{ count: number }>(
      `select count(*)::int as count from "player_entry" where "auction_id" = $1`,
      [auctionId],
    );
    if (count.rows[0]!.count >= PLAYER_ENTRY_LIMITS.maxEntriesPerAuction) {
      throw new PlayerSetupError(
        `An Auction can hold at most ${PLAYER_ENTRY_LIMITS.maxEntriesPerAuction} Player Entries.`,
      );
    }

    await assertExternalPlayerIdIsFree(
      client,
      auctionId,
      entry.externalPlayerId,
    );
    await assertCustomFieldsBelongToAuction(
      client,
      auctionId,
      Object.keys(entry.customValues),
    );

    const inserted = await client.query<PlayerEntryRow>(
      `insert into "player_entry"
          ("auction_id", "display_name", "role", "external_player_id",
           "phone_number", "starting_price_override")
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [
        auctionId,
        entry.displayName,
        entry.role,
        entry.externalPlayerId,
        entry.phoneNumber,
        entry.startingPriceOverride,
      ],
    );
    const row = inserted.rows[0]!;
    await replaceCustomValues(client, row.id, entry.customValues);
    const values = await loadCustomValues(client, [row.id]);
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return mapPlayerEntryRow(row, values.get(row.id) ?? {});
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Replaces a Player Entry's fields. Returns null when it is not editable by this Organizer. */
export async function updatePlayerEntry(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  playerEntryId: string,
  input: PlayerEntryInput,
): Promise<PlayerEntry | null> {
  const entry = playerEntryInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }

    const existing = await client.query(
      `select "id" from "player_entry" where "id" = $1 and "auction_id" = $2`,
      [playerEntryId, auctionId],
    );
    if (!existing.rowCount) {
      await client.query("rollback");
      return null;
    }

    await assertExternalPlayerIdIsFree(
      client,
      auctionId,
      entry.externalPlayerId,
      playerEntryId,
    );
    await assertCustomFieldsBelongToAuction(
      client,
      auctionId,
      Object.keys(entry.customValues),
    );

    const updated = await client.query<PlayerEntryRow>(
      `update "player_entry"
          set "display_name" = $3,
              "role" = $4,
              "external_player_id" = $5,
              "phone_number" = $6,
              "starting_price_override" = $7,
              "updated_at" = now()
        where "id" = $1 and "auction_id" = $2
        returning *`,
      [
        playerEntryId,
        auctionId,
        entry.displayName,
        entry.role,
        entry.externalPlayerId,
        entry.phoneNumber,
        entry.startingPriceOverride,
      ],
    );
    const row = updated.rows[0]!;
    await replaceCustomValues(client, row.id, entry.customValues);
    const values = await loadCustomValues(client, [row.id]);
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return mapPlayerEntryRow(row, values.get(row.id) ?? {});
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Removes a Player Entry and its custom values. Returns false when it is not editable by this Organizer. */
export async function deletePlayerEntry(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  playerEntryId: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return false;
    }

    const deleted = await client.query(
      `delete from "player_entry" where "id" = $1 and "auction_id" = $2`,
      [playerEntryId, auctionId],
    );
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return deleted.rowCount === 1;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Defines a Custom Player Field for one Auction. Returns null when the Auction is not editable by this Organizer. */
export async function createCustomPlayerField(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  input: CustomPlayerFieldInput,
): Promise<CustomPlayerField | null> {
  const field = customPlayerFieldInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }

    const count = await client.query<{ count: number }>(
      `select count(*)::int as count from "custom_player_field" where "auction_id" = $1`,
      [auctionId],
    );
    if (count.rows[0]!.count >= PLAYER_ENTRY_LIMITS.maxCustomFieldsPerAuction) {
      throw new PlayerSetupError(
        `An Auction can define at most ${PLAYER_ENTRY_LIMITS.maxCustomFieldsPerAuction} Custom Player Fields.`,
      );
    }

    const inserted = await client.query<CustomPlayerFieldRow>(
      `insert into "custom_player_field" ("auction_id", "label")
       values ($1, $2)
       returning *`,
      [auctionId, field.label],
    );
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return mapCustomPlayerFieldRow(inserted.rows[0]!);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Renames a Custom Player Field. Returns null when it is not editable by this Organizer. */
export async function updateCustomPlayerField(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  customPlayerFieldId: string,
  input: CustomPlayerFieldInput,
): Promise<CustomPlayerField | null> {
  const field = customPlayerFieldInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }

    const updated = await client.query<CustomPlayerFieldRow>(
      `update "custom_player_field"
          set "label" = $3, "updated_at" = now()
        where "id" = $1 and "auction_id" = $2
        returning *`,
      [customPlayerFieldId, auctionId, field.label],
    );
    if (!updated.rowCount) {
      await client.query("rollback");
      return null;
    }
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return mapCustomPlayerFieldRow(updated.rows[0]!);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Removes a Custom Player Field and every value stored for it. Returns false when it is not editable by this Organizer. */
export async function deleteCustomPlayerField(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  customPlayerFieldId: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return false;
    }

    const deleted = await client.query(
      `delete from "custom_player_field" where "id" = $1 and "auction_id" = $2`,
      [customPlayerFieldId, auctionId],
    );
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return deleted.rowCount === 1;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
