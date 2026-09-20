import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import {
  formatImportErrorsCsv,
  normalizePlayerImport,
  PLAYER_IMPORT_LIMITS,
  suggestImportMapping,
  validateImportMapping,
  type ImportTarget,
} from "@/domain/player-import";
import {
  parsePlayerImportFile,
  PlayerImportError,
  playerImportFileTypeFromName,
} from "@/server/import-export/player-import-file";

const FIELD_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const OTHER_FIELD_ID = "9c858901-8a57-4791-81fe-4c455b099bc9";

function csv(...lines: string[]): Uint8Array {
  return new TextEncoder().encode(`${lines.join("\n")}\n`);
}

function xlsxBytes(workbook: XLSX.WorkBook): Uint8Array {
  return new Uint8Array(
    XLSX.write(workbook, { bookType: "xlsx", type: "array" }),
  );
}

/**
 * A zip whose local header and central directory both name a VBA project,
 * which is how a macro-enabled workbook identifies itself.
 */
function zipMacroEntry(): Uint8Array {
  const name = new TextEncoder().encode("vbaProject.bin");

  const local = new Uint8Array(30 + name.length);
  local.set([0x50, 0x4b, 0x03, 0x04], 0);
  local[28] = name.length;
  local[29] = 0;
  local.set(name, 30);

  const central = new Uint8Array(46 + name.length);
  central.set([0x50, 0x4b, 0x01, 0x02], 0);
  central[44] = name.length;
  central[45] = 0;
  central.set(name, 46);

  const bytes = new Uint8Array(local.length + central.length);
  bytes.set(local, 0);
  bytes.set(central, local.length);
  return bytes;
}

describe("suggestImportMapping", () => {
  it("matches headers regardless of case, punctuation, and order", () => {
    expect(
      suggestImportMapping(["Role", "Favorite Color", "Phone-Number"], []),
    ).toEqual(["role", "ignore", "phoneNumber"]);
    expect(suggestImportMapping(["Player Name", "Role", "Phone"], [])).toEqual([
      "displayName",
      "role",
      "phoneNumber",
    ]);
  });

  it("assigns a repeated target to its first column only", () => {
    expect(suggestImportMapping(["Name", "Player"], [])).toEqual([
      "displayName",
      "ignore",
    ]);
  });

  it("matches a Custom Player Field by its label", () => {
    expect(
      suggestImportMapping(
        ["Name", "Position"],
        [{ id: FIELD_ID, label: "Position" }],
      ),
    ).toEqual(["displayName", `custom:${FIELD_ID}`]);
  });
});

describe("validateImportMapping", () => {
  it("requires exactly one Display name column", () => {
    expect(
      validateImportMapping(["displayName", "displayName"], []).length,
    ).toBeGreaterThan(0);
    expect(validateImportMapping(["role"], []).length).toBeGreaterThan(0);
    expect(validateImportMapping(["displayName", "role"], [])).toEqual([]);
  });

  it("rejects a repeated non-name field and an unknown target", () => {
    expect(validateImportMapping(["displayName", "role", "role"], [])).toEqual([
      "Map at most one column to Role; 2 are mapped.",
    ]);
    expect(
      validateImportMapping(["displayName", "nickname" as ImportTarget], []),
    ).toEqual(["A column maps to an unknown Player field: nickname."]);
  });

  it("rejects a Custom Player Field from another Auction", () => {
    expect(
      validateImportMapping(
        ["displayName", `custom:${OTHER_FIELD_ID}`],
        [FIELD_ID],
      ),
    ).toEqual([
      "A column maps to a Custom Player Field that does not belong to this Auction.",
    ]);
  });
});

describe("normalizePlayerImport", () => {
  it("normalizes reordered and optional columns", () => {
    const preview = normalizePlayerImport({
      columns: ["Role", "Player Name", "Phone"],
      customFieldIds: [],
      mapping: ["role", "displayName", "phoneNumber"],
      rows: [
        { cells: ["Captain", "  Alice  ", "+1 555 010 2030"], sourceRow: 2 },
        { cells: ["", "Bob", ""], sourceRow: 3 },
      ],
    });

    expect(preview.mappingProblems).toEqual([]);
    expect(preview.acceptedCount).toBe(2);
    expect(preview.errorCount).toBe(0);
    expect(preview.results[0]!.entry).toMatchObject({
      displayName: "Alice",
      externalPlayerId: null,
      phoneNumber: "+1 555 010 2030",
      role: "Captain",
      startingPriceOverride: null,
    });
    expect(preview.results[1]!.entry).toMatchObject({
      displayName: "Bob",
      phoneNumber: null,
      role: null,
    });
  });

  it("stores Custom Player Field values and skips empty ones", () => {
    const preview = normalizePlayerImport({
      columns: ["Name", "Position"],
      customFieldIds: [FIELD_ID],
      mapping: ["displayName", `custom:${FIELD_ID}`],
      rows: [
        { cells: ["Alice", "Defender"], sourceRow: 2 },
        { cells: ["Bob", "  "], sourceRow: 3 },
      ],
    });

    expect(preview.results[0]!.entry?.customValues).toEqual({
      [FIELD_ID]: "Defender",
    });
    expect(preview.results[1]!.entry?.customValues).toEqual({});
  });

  it("treats formula prefixes as plain text", () => {
    const preview = normalizePlayerImport({
      columns: ["Name", "Role"],
      customFieldIds: [],
      mapping: ["displayName", "role"],
      rows: [
        { cells: ["=SUM(A1:A2)", "+1-1"], sourceRow: 2 },
        { cells: ["@handle", "-dash"], sourceRow: 3 },
      ],
    });

    expect(preview.acceptedCount).toBe(2);
    expect(preview.results[0]!.entry).toMatchObject({
      displayName: "=SUM(A1:A2)",
      role: "+1-1",
    });
    expect(preview.results[1]!.entry).toMatchObject({
      displayName: "@handle",
      role: "-dash",
    });
  });

  it("reports malformed values as blocking errors", () => {
    const preview = normalizePlayerImport({
      columns: ["Name", "Phone", "Price"],
      customFieldIds: [],
      mapping: ["displayName", "phoneNumber", "startingPriceOverride"],
      rows: [
        { cells: ["   ", "+15550102030", ""], sourceRow: 2 },
        { cells: ["Bob", "not a phone", ""], sourceRow: 3 },
        { cells: ["Casey", "", "0"], sourceRow: 4 },
      ],
    });

    expect(preview.acceptedCount).toBe(0);
    expect(preview.errorCount).toBe(3);
    expect(preview.results.map((row) => row.status)).toEqual([
      "error",
      "error",
      "error",
    ]);
  });

  it("skips rows where every mapped cell is empty", () => {
    const preview = normalizePlayerImport({
      columns: ["Name", "Role"],
      customFieldIds: [],
      mapping: ["displayName", "role"],
      rows: [
        { cells: ["", ""], sourceRow: 2 },
        { cells: ["  ", " "], sourceRow: 3 },
        { cells: ["Alice", ""], sourceRow: 4 },
      ],
    });

    expect(preview.acceptedCount).toBe(1);
    expect(preview.results).toHaveLength(1);
    expect(preview.results[0]!.sourceRow).toBe(4);
  });

  it("rejects a duplicate External Player ID inside one file", () => {
    const preview = normalizePlayerImport({
      columns: ["Name", "External Player ID"],
      customFieldIds: [],
      mapping: ["displayName", "externalPlayerId"],
      rows: [
        { cells: ["Alice", "uid-1"], sourceRow: 2 },
        { cells: ["Bob", "uid-1"], sourceRow: 3 },
        { cells: ["Casey", ""], sourceRow: 4 },
      ],
    });

    expect(preview.acceptedCount).toBe(2);
    expect(preview.errorCount).toBe(1);
    expect(preview.results[1]).toMatchObject({
      entry: null,
      sourceRow: 3,
      status: "error",
    });
  });

  it("rejects an External Player ID already used in the Auction", () => {
    const preview = normalizePlayerImport({
      columns: ["Name", "External Player ID"],
      customFieldIds: [],
      existingExternalPlayerIds: ["uid-1"],
      mapping: ["displayName", "externalPlayerId"],
      rows: [{ cells: ["Alice", "uid-1"], sourceRow: 2 }],
    });

    expect(preview.acceptedCount).toBe(0);
    expect(preview.results[0]!.messages[0]).toContain("already used");
  });

  it("warns about a duplicate normalized name but still accepts the row", () => {
    const preview = normalizePlayerImport({
      columns: ["Name"],
      customFieldIds: [],
      existingDisplayNames: ["Alice"],
      mapping: ["displayName"],
      rows: [
        { cells: ["  alice "], sourceRow: 2 },
        { cells: ["Bob"], sourceRow: 3 },
      ],
    });

    expect(preview.acceptedCount).toBe(2);
    expect(preview.warningCount).toBe(1);
    expect(preview.results[0]).toMatchObject({
      status: "warning",
      sourceRow: 2,
    });
    expect(preview.results[1]).toMatchObject({ status: "accepted" });
  });

  it("blocks every row when the mapping itself is unusable", () => {
    const preview = normalizePlayerImport({
      columns: ["Name", "Role"],
      customFieldIds: [],
      mapping: ["ignore", "role"],
      rows: [{ cells: ["Alice", "Captain"], sourceRow: 2 }],
    });

    expect(preview.acceptedCount).toBe(0);
    expect(preview.results).toEqual([]);
    expect(preview.mappingProblems).toContain(
      "Map exactly one column to Display name.",
    );
  });
});

describe("formatImportErrorsCsv", () => {
  it("lists only blocking errors with their row numbers", () => {
    const preview = normalizePlayerImport({
      columns: ["Name", "Phone"],
      customFieldIds: [],
      mapping: ["displayName", "phoneNumber"],
      rows: [
        { cells: ["Alice", "+15550102030"], sourceRow: 2 },
        { cells: ["Bob", "nope"], sourceRow: 3 },
        { cells: ["Casey", "also nope"], sourceRow: 4 },
      ],
    });

    const output = formatImportErrorsCsv(preview);
    expect(output.split("\r\n")[0]).toBe("Row,Problem");
    expect(output).toContain("3,");
    expect(output).toContain("4,");
    expect(output).not.toContain("+15550102030");
  });
});

describe("playerImportFileTypeFromName", () => {
  it("accepts only csv and xlsx extensions", () => {
    expect(playerImportFileTypeFromName("Players.CSV")).toBe("csv");
    expect(playerImportFileTypeFromName("players.xlsx")).toBe("xlsx");
    expect(playerImportFileTypeFromName("players.xls")).toBeNull();
    expect(playerImportFileTypeFromName("players.txt")).toBeNull();
  });
});

describe("parsePlayerImportFile", () => {
  it("reads a CSV into one worksheet with a header row", () => {
    const parsed = parsePlayerImportFile(
      "players.csv",
      csv("Name,Role", "Alice,Captain", "Bob,"),
    );

    expect(parsed.fileType).toBe("csv");
    expect(parsed.worksheets).toHaveLength(1);
    expect(parsed.worksheets[0]).toMatchObject({
      columns: ["Name", "Role"],
      name: "CSV",
    });
    expect(parsed.worksheets[0]!.rows).toEqual([
      { cells: ["Alice", "Captain"], sourceRow: 2 },
      { cells: ["Bob", ""], sourceRow: 3 },
    ]);
  });

  it("reads every worksheet of a workbook, ready for selection", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Name", "Role"],
        ["Alice", "Captain"],
      ]),
      "First",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Player Name"], ["Bob"]]),
      "Second",
    );

    const parsed = parsePlayerImportFile("players.xlsx", xlsxBytes(workbook));

    expect(parsed.worksheets.map((sheet) => sheet.name)).toEqual([
      "First",
      "Second",
    ]);
    expect(parsed.worksheets[1]!.rows[0]).toEqual({
      cells: ["Bob"],
      sourceRow: 2,
    });
  });

  it("uses a formula's stored result as plain text", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Name", "Price"],
      ["Alice", 0],
    ]);
    sheet.B2 = { f: "1+1", t: "n", v: 2 };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");

    const parsed = parsePlayerImportFile("players.xlsx", xlsxBytes(workbook));

    expect(parsed.worksheets[0]!.rows[0]).toEqual({
      cells: ["Alice", "2"],
      sourceRow: 2,
    });
  });

  it("rejects content that does not match the claimed type", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Name"]]),
      "S",
    );
    const spreadsheet = xlsxBytes(workbook);

    expect(() => parsePlayerImportFile("players.csv", spreadsheet)).toThrow(
      PlayerImportError,
    );
    expect(() =>
      parsePlayerImportFile("players.xlsx", csv("Name", "Alice")),
    ).toThrow(PlayerImportError);
    expect(() => parsePlayerImportFile("players.txt", csv("Name"))).toThrow(
      PlayerImportError,
    );
  });

  it("rejects legacy binary workbooks and macro-enabled files", () => {
    const ole = new Uint8Array([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00,
    ]);
    expect(() => parsePlayerImportFile("players.xls", ole)).toThrow(
      "Save the file as .xlsx or .csv.",
    );
    expect(() =>
      parsePlayerImportFile("players.xlsm", csv("Name", "Alice")),
    ).toThrow("Macro-enabled workbooks are not supported.");
    expect(() =>
      parsePlayerImportFile("players.xlsx", zipMacroEntry()),
    ).toThrow("Macro-enabled workbooks are not supported.");

    // The same text appearing as data is not a macro.
    expect(
      parsePlayerImportFile("players.csv", csv("Name", "Report vbaProject.bin"))
        .worksheets[0]!.rows[0]!.cells,
    ).toEqual(["Report vbaProject.bin"]);
  });

  it("rejects binary content that claims to be a CSV", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0a, 0x1a]);
    expect(() => parsePlayerImportFile("players.csv", png)).toThrow(
      "its content is not text",
    );

    const utf16 = new Uint8Array([0xff, 0xfe, 0x41, 0x00]);
    expect(() => parsePlayerImportFile("players.csv", utf16)).toThrow(
      "UTF-8 encoding",
    );

    const invalidUtf8 = new Uint8Array([0xc3, 0x28]);
    expect(() => parsePlayerImportFile("players.csv", invalidUtf8)).toThrow(
      "not valid UTF-8 text",
    );
  });

  it("rejects a cell longer than the cell-length limit", () => {
    const tooLong = "a".repeat(PLAYER_IMPORT_LIMITS.maxCellLength + 1);
    expect(() =>
      parsePlayerImportFile("players.csv", csv("Name,Notes", "Alice", tooLong)),
    ).toThrow("holds more than");
  });

  it("rejects more columns or worksheets than the limits", () => {
    const columns = Array.from(
      { length: PLAYER_IMPORT_LIMITS.maxColumns + 1 },
      (_, index) => `Column ${index}`,
    );
    expect(() =>
      parsePlayerImportFile("players.csv", csv(columns.join(","), "Alice")),
    ).toThrow("the limit is");

    const workbook = XLSX.utils.book_new();
    for (
      let index = 0;
      index <= PLAYER_IMPORT_LIMITS.maxWorksheets;
      index += 1
    ) {
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([["Name"]]),
        `Sheet${index}`,
      );
    }
    expect(() =>
      parsePlayerImportFile("players.xlsx", xlsxBytes(workbook)),
    ).toThrow("the limit is");
  });

  it("rejects an empty file, an oversized file, and too many rows", () => {
    expect(() =>
      parsePlayerImportFile("players.csv", new Uint8Array()),
    ).toThrow("The uploaded file is empty.");

    const oversized = new Uint8Array(PLAYER_IMPORT_LIMITS.maxFileBytes + 1);
    expect(() => parsePlayerImportFile("players.csv", oversized)).toThrow(
      "Import files must be at most",
    );

    const rows = ["Name"];
    for (let index = 0; index <= PLAYER_IMPORT_LIMITS.maxRows; index += 1) {
      rows.push(`Player ${index}`);
    }
    expect(() => parsePlayerImportFile("players.csv", csv(...rows))).toThrow(
      "the limit is",
    );
  });
});
