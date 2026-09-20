import type { Pool } from "pg";

import {
  suggestImportMapping,
  type ImportTarget,
  type PlayerImportPreviewData,
} from "@/domain/player-import";
import {
  getCustomPlayerFieldsForOrganizer,
  getPlayerEntriesForOrganizer,
} from "@/server/auction-query/player-entries";
import { parsePlayerImportFile } from "@/server/import-export/player-import-file";

export type { PlayerImportPreviewData };

/**
 * Parses an uploaded file and returns everything the Organizer needs to map
 * and preview it. Returns null when the Auction is not an editable Draft for
 * this Organizer, so callers cannot tell "missing" from "not yours".
 */
export async function previewPlayerImport(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<null | PlayerImportPreviewData> {
  const parsed = parsePlayerImportFile(fileName, bytes);

  const [fields, entries] = await Promise.all([
    getCustomPlayerFieldsForOrganizer(pool, organizerId, auctionId),
    getPlayerEntriesForOrganizer(pool, organizerId, auctionId),
  ]);
  if (!fields || !entries) return null;

  const customFields = fields.map((field) => ({
    id: field.id,
    label: field.label,
  }));
  const suggestedMappings: Record<string, ImportTarget[]> = {};
  for (const worksheet of parsed.worksheets) {
    suggestedMappings[worksheet.name] = suggestImportMapping(
      worksheet.columns,
      customFields,
    );
  }

  return {
    customFields,
    existingDisplayNames: entries.map((entry) => entry.displayName),
    existingExternalPlayerIds: entries.flatMap((entry) =>
      entry.externalPlayerId ? [entry.externalPlayerId] : [],
    ),
    fileType: parsed.fileType,
    suggestedMappings,
    worksheets: parsed.worksheets,
  };
}
