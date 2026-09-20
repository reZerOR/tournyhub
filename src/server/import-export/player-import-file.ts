import { parse as parseCsv } from "csv-parse/sync";
import * as XLSX from "xlsx";

import {
  PLAYER_IMPORT_FILE_SIZE_MESSAGE,
  PLAYER_IMPORT_LIMITS,
  type ImportSourceRow,
  type PlayerImportFileType,
  type PlayerImportWorksheetData,
} from "@/domain/player-import";

/**
 * A file problem the Organizer can fix in the source spreadsheet, as opposed
 * to an unexpected failure. Server actions surface its message directly.
 */
export class PlayerImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerImportError";
  }
}

export interface ParsedPlayerImportFile {
  fileType: PlayerImportFileType;
  worksheets: PlayerImportWorksheetData[];
}

const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
];
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const LOCAL_HEADER_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const CENTRAL_HEADER_SIGNATURE = [0x50, 0x4b, 0x01, 0x02];
const MACRO_ENTRY_NAME = "vbaProject.bin";
/** Bytes between a zip local header signature and its filename. */
const LOCAL_HEADER_LENGTH = 30;
/** Bytes between a zip central directory signature and its filename. */
const CENTRAL_HEADER_LENGTH = 46;
const LEGACY_WORKBOOK_MESSAGE =
  "Legacy .xls files are not supported. Save the file as .xlsx or .csv.";
const MACRO_WORKBOOK_MESSAGE =
  "Macro-enabled workbooks are not supported. Save a plain .xlsx file.";

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * True when the zip's entry table lists a VBA project. The name is only
 * trusted where a zip header introduces it, so a cell that merely contains the
 * text cannot be mistaken for a macro.
 */
function containsMacroEntry(bytes: Uint8Array): boolean {
  const name = new TextEncoder().encode(MACRO_ENTRY_NAME);

  for (let index = 0; index + name.length <= bytes.length; index += 1) {
    if (!startsWith(bytes.subarray(index), [...name])) continue;

    const lengthOffset = index - 2;
    if (
      lengthOffset < 0 ||
      bytes[lengthOffset] !== name.length ||
      bytes[lengthOffset + 1] !== 0
    ) {
      continue;
    }

    for (const [headerLength, signature] of [
      [LOCAL_HEADER_LENGTH, LOCAL_HEADER_SIGNATURE],
      [CENTRAL_HEADER_LENGTH, CENTRAL_HEADER_SIGNATURE],
    ] as const) {
      const headerOffset = index - headerLength;
      if (headerOffset < 0) continue;
      if (startsWith(bytes.subarray(headerOffset), signature)) return true;
    }
  }

  return false;
}

function hasUtf16Bom(bytes: Uint8Array): boolean {
  return (
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff)
  );
}

type ContentKind = "ole" | "text" | "zip";

function detectContentKind(bytes: Uint8Array): ContentKind {
  if (ZIP_SIGNATURES.some((signature) => startsWith(bytes, signature))) {
    return "zip";
  }
  if (startsWith(bytes, OLE_SIGNATURE)) return "ole";
  return "text";
}

/**
 * A real CSV is UTF-8 text. Binary content that merely carries a .csv name is
 * refused here rather than handed to the parser as garbage rows.
 */
function assertCsvIsText(bytes: Uint8Array): void {
  if (hasUtf16Bom(bytes)) {
    throw new PlayerImportError(
      "Save the CSV file with UTF-8 encoding, then upload it again.",
    );
  }
  if (bytes.includes(0)) {
    throw new PlayerImportError(
      "The file is named .csv but its content is not text.",
    );
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PlayerImportError(
      "The file is named .csv but its content is not valid UTF-8 text.",
    );
  }
}

export function playerImportFileTypeFromName(
  fileName: string,
): null | PlayerImportFileType {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx")) return "xlsx";
  return null;
}

function toWorksheet(
  name: string,
  records: string[][],
): PlayerImportWorksheetData {
  const header = (records[0] ?? []).map((cell) =>
    cell === undefined || cell === null ? "" : String(cell).trim(),
  );
  while (header.length > 0 && header[header.length - 1]!.length === 0) {
    header.pop();
  }

  if (header.length === 0) {
    throw new PlayerImportError(`Worksheet "${name}" has no columns.`);
  }
  if (header.length > PLAYER_IMPORT_LIMITS.maxColumns) {
    throw new PlayerImportError(
      `Worksheet "${name}" has ${header.length} columns; the limit is ${PLAYER_IMPORT_LIMITS.maxColumns}.`,
    );
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length > PLAYER_IMPORT_LIMITS.maxRows) {
    throw new PlayerImportError(
      `Worksheet "${name}" has more than ${PLAYER_IMPORT_LIMITS.maxRows} rows; the limit is ${PLAYER_IMPORT_LIMITS.maxRows}.`,
    );
  }

  const rows: ImportSourceRow[] = [];
  dataRecords.forEach((cells, index) => {
    const row = header.map((_, column) => {
      const value = cells[column];
      return value === undefined || value === null ? "" : String(value);
    });

    const overflowedColumn = row.findIndex(
      (cell) => cell.length > PLAYER_IMPORT_LIMITS.maxCellLength,
    );
    if (overflowedColumn !== -1) {
      throw new PlayerImportError(
        `Worksheet "${name}" row ${index + 2}, column "${header[overflowedColumn] || overflowedColumn + 1}" holds more than ${PLAYER_IMPORT_LIMITS.maxCellLength} characters.`,
      );
    }

    rows.push({ cells: row, sourceRow: index + 2 });
  });

  return { columns: header, name, rows };
}

function parseCsvWorksheet(bytes: Uint8Array): PlayerImportWorksheetData {
  let records: string[][];
  try {
    records = parseCsv(bytes, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: false,
    }) as string[][];
  } catch {
    throw new PlayerImportError(
      "The CSV file could not be read. Check that it is a well-formed CSV file.",
    );
  }
  return toWorksheet("CSV", records);
}

function parseXlsxWorksheets(bytes: Uint8Array): PlayerImportWorksheetData[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      // Bound the read: a small file can still describe a huge worksheet.
      sheetRows: PLAYER_IMPORT_LIMITS.maxRows + 2,
      type: "array",
    });
  } catch {
    throw new PlayerImportError(
      "The XLSX file could not be read. Check that it is a valid workbook.",
    );
  }

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new PlayerImportError("The workbook has no worksheets.");
  }
  if (sheetNames.length > PLAYER_IMPORT_LIMITS.maxWorksheets) {
    throw new PlayerImportError(
      `The workbook has ${sheetNames.length} worksheets; the limit is ${PLAYER_IMPORT_LIMITS.maxWorksheets}.`,
    );
  }

  return sheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const records = XLSX.utils.sheet_to_json<unknown[]>(sheet!, {
      blankrows: true,
      defval: "",
      header: 1,
      raw: false,
    });
    return toWorksheet(
      name,
      records.map((record) => Array.from(record, (cell) => String(cell ?? ""))),
    );
  });
}

/**
 * Reads an uploaded spreadsheet into worksheets of plain string cells. The
 * file's name claims its type and its bytes must agree, so a renamed file and
 * a misleading extension cannot choose a different parser. Macros and legacy
 * binary workbooks are refused, and a formula or link is only ever its stored
 * text, never something TournyHub evaluates.
 */
export function parsePlayerImportFile(
  fileName: string,
  bytes: Uint8Array,
): ParsedPlayerImportFile {
  if (bytes.length === 0) {
    throw new PlayerImportError("The uploaded file is empty.");
  }
  if (bytes.length > PLAYER_IMPORT_LIMITS.maxFileBytes) {
    throw new PlayerImportError(PLAYER_IMPORT_FILE_SIZE_MESSAGE);
  }

  const fileType = playerImportFileTypeFromName(fileName);
  if (!fileType) {
    const lowerName = fileName.trim().toLowerCase();
    if (lowerName.endsWith(".xls") || lowerName.endsWith(".xlsb")) {
      throw new PlayerImportError(LEGACY_WORKBOOK_MESSAGE);
    }
    if (lowerName.endsWith(".xlsm")) {
      throw new PlayerImportError(MACRO_WORKBOOK_MESSAGE);
    }
    throw new PlayerImportError("Upload a .csv or .xlsx file.");
  }

  const kind = detectContentKind(bytes);

  if (fileType === "csv") {
    if (kind === "zip") {
      throw new PlayerImportError(
        "The file is named .csv but its content is a spreadsheet workbook.",
      );
    }
    if (kind === "ole") {
      throw new PlayerImportError(LEGACY_WORKBOOK_MESSAGE);
    }
    assertCsvIsText(bytes);
    return { fileType, worksheets: [parseCsvWorksheet(bytes)] };
  }

  if (kind !== "zip") {
    throw new PlayerImportError(
      kind === "ole"
        ? LEGACY_WORKBOOK_MESSAGE
        : "The file is named .xlsx but its content is not a spreadsheet workbook.",
    );
  }
  if (containsMacroEntry(bytes)) {
    throw new PlayerImportError(MACRO_WORKBOOK_MESSAGE);
  }

  return { fileType, worksheets: parseXlsxWorksheets(bytes) };
}
