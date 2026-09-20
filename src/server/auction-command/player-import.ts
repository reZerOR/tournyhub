import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { PLAYER_ENTRY_LIMITS } from "@/domain/player-entry";
import {
  normalizePlayerImport,
  type ImportTarget,
  type PlayerImportPreview,
} from "@/domain/player-import";
import {
  lockEditableAuction,
  markAuctionDraft,
} from "@/server/auction-command/lock-editable-auction";
import {
  getCustomPlayerFieldsForOrganizer,
  getPlayerEntriesForOrganizer,
} from "@/server/auction-query/player-entries";
import {
  parsePlayerImportFile,
  PlayerImportError,
} from "@/server/import-export/player-import-file";

const importSelectionSchema = z.object({
  commandId: z.uuid(),
  mapping: z.array(z.string()),
  worksheetName: z.string().trim().min(1),
});

export interface PlayerImportSelection {
  commandId: string;
  mapping: string[];
  worksheetName: string;
}

export interface PlayerImportCommit {
  commandId: string;
  duplicate: boolean;
  importedCount: number;
  warningCount: number;
}

interface PlayerImportRow {
  command_id: string;
  imported_count: number;
  warning_count: number;
}

async function insertImportedEntries(
  client: PoolClient,
  auctionId: string,
  preview: PlayerImportPreview,
): Promise<void> {
  const accepted = preview.results.flatMap((row) =>
    row.entry ? [{ entry: row.entry, id: randomUUID() }] : [],
  );
  if (accepted.length === 0) return;

  await client.query(
    `insert into "player_entry"
        ("id", "auction_id", "display_name", "role", "external_player_id",
         "phone_number", "starting_price_override")
     select * from unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[],
                          $5::text[], $6::text[], $7::int[])`,
    [
      accepted.map((row) => row.id),
      accepted.map(() => auctionId),
      accepted.map((row) => row.entry.displayName),
      accepted.map((row) => row.entry.role),
      accepted.map((row) => row.entry.externalPlayerId),
      accepted.map((row) => row.entry.phoneNumber),
      accepted.map((row) => row.entry.startingPriceOverride),
    ],
  );

  const entryIds: string[] = [];
  const fieldIds: string[] = [];
  const values: string[] = [];
  for (const row of accepted) {
    for (const [fieldId, value] of Object.entries(row.entry.customValues)) {
      entryIds.push(row.id);
      fieldIds.push(fieldId);
      values.push(value);
    }
  }
  if (entryIds.length === 0) return;

  await client.query(
    `insert into "player_entry_custom_value"
        ("player_entry_id", "custom_player_field_id", "value")
     select * from unnest($1::uuid[], $2::uuid[], $3::text[])`,
    [entryIds, fieldIds, values],
  );
}

/**
 * Commits every accepted row of an upload in one transaction, or nothing.
 * A repeated command ID returns the first result without inserting again, and
 * the Auction row is locked first so concurrent imports cannot race the cap or
 * the External Player ID rule. Returns null when the Auction is not an
 * editable Draft owned by this Organizer.
 */
export async function commitPlayerImport(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  fileName: string,
  bytes: Uint8Array,
  selection: PlayerImportSelection,
): Promise<null | PlayerImportCommit> {
  const parsed = parsePlayerImportFile(fileName, bytes);
  const chosen = importSelectionSchema.parse(selection);

  const worksheet = parsed.worksheets.find(
    (candidate) => candidate.name === chosen.worksheetName,
  );
  if (!worksheet) {
    throw new PlayerImportError(
      "That worksheet is not in the uploaded file. Preview the file again.",
    );
  }
  if (chosen.mapping.length !== worksheet.columns.length) {
    throw new PlayerImportError(
      "The column mapping does not match the file. Preview the file again.",
    );
  }
  const mapping = chosen.mapping as ImportTarget[];

  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }

    const previous = await client.query<PlayerImportRow>(
      `select "command_id", "imported_count", "warning_count"
         from "player_import"
        where "auction_id" = $1 and "command_id" = $2`,
      [auctionId, chosen.commandId],
    );
    if (previous.rowCount === 1) {
      await client.query("commit");
      const row = previous.rows[0]!;
      return {
        commandId: row.command_id,
        duplicate: true,
        importedCount: row.imported_count,
        warningCount: row.warning_count,
      };
    }

    // Sequential: these run on the transaction client, and PostgreSQL rejects
    // two queries on one connection at the same time.
    const fields = await getCustomPlayerFieldsForOrganizer(
      client,
      organizerId,
      auctionId,
    );
    const entries = await getPlayerEntriesForOrganizer(
      client,
      organizerId,
      auctionId,
    );
    if (!fields || !entries) {
      await client.query("rollback");
      return null;
    }

    const preview = normalizePlayerImport({
      columns: worksheet.columns,
      customFieldIds: fields.map((field) => field.id),
      existingDisplayNames: entries.map((entry) => entry.displayName),
      existingExternalPlayerIds: entries.flatMap((entry) =>
        entry.externalPlayerId ? [entry.externalPlayerId] : [],
      ),
      mapping,
      rows: worksheet.rows,
    });

    if (preview.mappingProblems.length > 0) {
      throw new PlayerImportError(preview.mappingProblems[0]!);
    }
    if (preview.errorCount > 0) {
      throw new PlayerImportError(
        `${preview.errorCount} row${preview.errorCount === 1 ? "" : "s"} could not be imported. Download the errors, fix the file, and try again.`,
      );
    }
    if (preview.acceptedCount === 0) {
      throw new PlayerImportError("The file has no Player rows to import.");
    }
    if (
      entries.length + preview.acceptedCount >
      PLAYER_ENTRY_LIMITS.maxEntriesPerAuction
    ) {
      throw new PlayerImportError(
        `This Auction can hold at most ${PLAYER_ENTRY_LIMITS.maxEntriesPerAuction} Player Entries; this import would exceed that.`,
      );
    }

    await insertImportedEntries(client, auctionId, preview);
    await client.query(
      `insert into "player_import"
          ("auction_id", "command_id", "imported_count", "warning_count")
       values ($1, $2, $3, $4)`,
      [
        auctionId,
        chosen.commandId,
        preview.acceptedCount,
        preview.warningCount,
      ],
    );
    await markAuctionDraft(client, auctionId);
    await client.query("commit");

    return {
      commandId: chosen.commandId,
      duplicate: false,
      importedCount: preview.acceptedCount,
      warningCount: preview.warningCount,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
