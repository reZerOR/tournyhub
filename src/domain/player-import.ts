import { z } from "zod";

import {
  normalizeDisplayName,
  playerEntryInputSchema,
} from "@/domain/player-entry";

export const PLAYER_IMPORT_LIMITS = {
  maxCellLength: 1000,
  maxColumns: 100,
  maxFileBytes: 5 * 1024 * 1024,
  maxRows: 10_000,
  maxWorksheets: 20,
} as const;

/** The file-size limit in whole megabytes, for messages the Organizer reads. */
export const PLAYER_IMPORT_MAX_MEGABYTES = Math.round(
  PLAYER_IMPORT_LIMITS.maxFileBytes / (1024 * 1024),
);

export const PLAYER_IMPORT_FILE_SIZE_MESSAGE = `Import files must be at most ${PLAYER_IMPORT_MAX_MEGABYTES} MB.`;

export const PLAYER_IMPORT_FILE_TYPES = ["csv", "xlsx"] as const;
export type PlayerImportFileType = (typeof PLAYER_IMPORT_FILE_TYPES)[number];

export const STANDARD_IMPORT_TARGETS = [
  "displayName",
  "role",
  "externalPlayerId",
  "phoneNumber",
  "startingPriceOverride",
] as const;
export type StandardImportTarget = (typeof STANDARD_IMPORT_TARGETS)[number];

/**
 * Where one source column goes during an import. `ignore` leaves the column
 * unread, a standard target fills a Player Entry field, and `custom:<id>`
 * fills one Custom Player Field of the Auction.
 */
export type ImportTarget = `custom:${string}` | "ignore" | StandardImportTarget;

const STANDARD_TARGET_LABELS: Record<StandardImportTarget, string[]> = {
  displayName: ["display name", "name", "player", "player name", "full name"],
  externalPlayerId: [
    "external player id",
    "external id",
    "external player",
    "game uid",
    "player id",
    "uid",
  ],
  phoneNumber: [
    "phone",
    "phone number",
    "mobile",
    "mobile number",
    "contact",
    "contact number",
  ],
  role: ["role", "player role"],
  startingPriceOverride: [
    "starting price",
    "start price",
    "base price",
    "price",
  ],
};

export const STANDARD_IMPORT_TARGET_LABELS: Record<
  StandardImportTarget,
  string
> = {
  displayName: "Display name",
  externalPlayerId: "External Player ID",
  phoneNumber: "Phone number",
  role: "Role",
  startingPriceOverride: "Starting price override",
};

export const CUSTOM_IMPORT_PREFIX = "custom:";

export function customImportTarget(customPlayerFieldId: string): ImportTarget {
  return `${CUSTOM_IMPORT_PREFIX}${customPlayerFieldId}`;
}

export function customFieldIdFromTarget(target: ImportTarget): null | string {
  return target.startsWith(CUSTOM_IMPORT_PREFIX)
    ? target.slice(CUSTOM_IMPORT_PREFIX.length)
    : null;
}

/** Case, punctuation, and surrounding whitespace do not distinguish two headers. */
export function normalizeImportHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface ImportCustomField {
  id: string;
  label: string;
}

/**
 * Best-effort mapping from source headers to Player fields. A target is
 * assigned to its first matching column only, so a repeated target leaves the
 * later columns ignored rather than silently overwriting the first.
 */
export function suggestImportMapping(
  columns: readonly string[],
  customFields: readonly ImportCustomField[],
): ImportTarget[] {
  const used = new Set<ImportTarget>();

  return columns.map((column) => {
    const header = normalizeImportHeader(column);
    if (header.length === 0) return "ignore";

    for (const target of STANDARD_IMPORT_TARGETS) {
      if (used.has(target)) continue;
      if (STANDARD_TARGET_LABELS[target].includes(header)) {
        used.add(target);
        return target;
      }
    }

    for (const field of customFields) {
      const target = customImportTarget(field.id);
      if (used.has(target)) continue;
      if (normalizeImportHeader(field.label) === header) {
        used.add(target);
        return target;
      }
    }

    return "ignore";
  });
}

function labelForTarget(target: string): string {
  const customFieldId = customFieldIdFromTarget(target as ImportTarget);
  if (customFieldId) return "a Custom Player Field";
  return (
    STANDARD_IMPORT_TARGET_LABELS[target as StandardImportTarget] ??
    `"${target}"`
  );
}

/**
 * The problems that make the whole mapping unusable: an unknown target, a
 * column mapped to another Auction's Custom Player Field, a missing Display
 * name, or one field fed by several columns.
 */
export function validateImportMapping(
  mapping: readonly ImportTarget[],
  customFieldIds: readonly string[],
): string[] {
  const problems: string[] = [];
  const allowedCustomFieldIds = new Set(customFieldIds);
  const counts = new Map<string, number>();

  for (const target of mapping) {
    if (target === "ignore") continue;

    const customFieldId = customFieldIdFromTarget(target);
    if (customFieldId) {
      if (!allowedCustomFieldIds.has(customFieldId)) {
        problems.push(
          "A column maps to a Custom Player Field that does not belong to this Auction.",
        );
        continue;
      }
    } else if (
      !(STANDARD_IMPORT_TARGETS as readonly string[]).includes(target)
    ) {
      problems.push(`A column maps to an unknown Player field: ${target}.`);
      continue;
    }

    counts.set(target, (counts.get(target) ?? 0) + 1);
  }

  if ((counts.get("displayName") ?? 0) !== 1) {
    problems.push("Map exactly one column to Display name.");
  }
  for (const [target, count] of counts) {
    if (target !== "displayName" && count > 1) {
      problems.push(
        `Map at most one column to ${labelForTarget(target)}; ${count} are mapped.`,
      );
    }
  }

  return [...new Set(problems)];
}

export interface ImportSourceRow {
  cells: string[];
  /** The spreadsheet row number, counting the header as row 1. */
  sourceRow: number;
}

/** A worksheet reduced to plain string cells, ready to normalize. */
export interface PlayerImportWorksheetData {
  columns: string[];
  name: string;
  rows: ImportSourceRow[];
}

/** Everything the Organizer needs to map and preview one uploaded file. */
export interface PlayerImportPreviewData {
  customFields: ImportCustomField[];
  existingDisplayNames: string[];
  existingExternalPlayerIds: string[];
  fileType: PlayerImportFileType;
  suggestedMappings: Record<string, ImportTarget[]>;
  worksheets: PlayerImportWorksheetData[];
}

export type PlayerImportEntry = z.output<typeof playerEntryInputSchema>;

export interface ImportedPlayerRow {
  /** The normalized Player Entry to insert, absent when the row is rejected. */
  entry: null | PlayerImportEntry;
  messages: string[];
  sourceRow: number;
  status: "accepted" | "error" | "warning";
}

export interface PlayerImportPreview {
  /** Rows that will be inserted: accepted plus warned rows. */
  acceptedCount: number;
  errorCount: number;
  /** File-level problems that block every row, such as a bad column mapping. */
  mappingProblems: string[];
  results: ImportedPlayerRow[];
  warningCount: number;
}

export interface NormalizePlayerImportInput {
  columns: readonly string[];
  customFieldIds: readonly string[];
  existingDisplayNames?: readonly string[];
  existingExternalPlayerIds?: readonly string[];
  mapping: readonly ImportTarget[];
  rows: readonly ImportSourceRow[];
}

function errorRow(sourceRow: number, messages: string[]): ImportedPlayerRow {
  return { entry: null, messages, sourceRow, status: "error" };
}

/**
 * Turns a parsed worksheet into the exact Player Entries an import would
 * create. Rows with blocking errors are listed but never returned as entries,
 * so the Organizer previews the outcome before anything is written. Existing
 * Auction data feeds the duplicate checks so the preview matches the commit.
 */
export function normalizePlayerImport(
  input: NormalizePlayerImportInput,
): PlayerImportPreview {
  const mappingProblems = validateImportMapping(
    input.mapping,
    input.customFieldIds,
  );
  if (mappingProblems.length > 0) {
    return {
      acceptedCount: 0,
      errorCount: 0,
      mappingProblems,
      results: [],
      warningCount: 0,
    };
  }

  const externalPlayerIdColumns = new Set(
    (input.existingExternalPlayerIds ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
  const displayNameKeys = new Set(
    (input.existingDisplayNames ?? []).map(normalizeDisplayName),
  );

  const results: ImportedPlayerRow[] = [];
  let acceptedCount = 0;
  let errorCount = 0;
  let warningCount = 0;

  for (const row of input.rows) {
    if (row.cells.every((cell) => cell.trim().length === 0)) continue;

    const raw = new Map<ImportTarget, string>();
    input.mapping.forEach((target, index) => {
      if (target === "ignore") return;
      raw.set(target, (row.cells[index] ?? "").trim());
    });

    const customValues: Record<string, string> = {};
    for (const [target, value] of raw) {
      const customFieldId = customFieldIdFromTarget(target);
      if (customFieldId && value.length > 0) {
        customValues[customFieldId] = value;
      }
    }

    const parsed = playerEntryInputSchema.safeParse({
      customValues,
      displayName: raw.get("displayName") ?? "",
      externalPlayerId: raw.get("externalPlayerId") ?? "",
      phoneNumber: raw.get("phoneNumber") ?? "",
      role: raw.get("role") ?? "",
      startingPriceOverride: raw.get("startingPriceOverride") ?? "",
    });

    if (!parsed.success) {
      errorCount += 1;
      results.push(
        errorRow(row.sourceRow, [
          ...new Set(parsed.error.issues.map((issue) => issue.message)),
        ]),
      );
      continue;
    }

    const entry = parsed.data;
    if (entry.externalPlayerId) {
      if (externalPlayerIdColumns.has(entry.externalPlayerId)) {
        errorCount += 1;
        results.push(
          errorRow(row.sourceRow, [
            `External Player ID "${entry.externalPlayerId}" is already used in this Auction.`,
          ]),
        );
        continue;
      }
      externalPlayerIdColumns.add(entry.externalPlayerId);
    }

    const nameKey = normalizeDisplayName(entry.displayName);
    const messages: string[] = [];
    if (displayNameKeys.has(nameKey)) {
      messages.push(
        `Another Player Entry is also named "${entry.displayName}".`,
      );
    }
    displayNameKeys.add(nameKey);

    acceptedCount += 1;
    if (messages.length > 0) {
      warningCount += 1;
      results.push({
        entry,
        messages,
        sourceRow: row.sourceRow,
        status: "warning",
      });
    } else {
      results.push({
        entry,
        messages,
        sourceRow: row.sourceRow,
        status: "accepted",
      });
    }
  }

  return { acceptedCount, errorCount, mappingProblems, results, warningCount };
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * A row-numbered CSV of the blocking errors alone. It carries only the
 * Organizer's own upload, never other Auction data, so it is safe to download.
 */
export function formatImportErrorsCsv(preview: PlayerImportPreview): string {
  const lines = ["Row,Problem"];
  for (const row of preview.results) {
    if (row.status !== "error") continue;
    for (const message of row.messages) {
      lines.push(`${row.sourceRow},${escapeCsvCell(message)}`);
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}
