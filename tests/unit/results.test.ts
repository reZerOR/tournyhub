import { describe, expect, it } from "vitest";

import {
  canViewPhoneNumbers,
  escapeSpreadsheetCell,
  exportFileName,
  formatCsv,
  HIDDEN_PHONE,
  resultsPhase,
} from "@/domain/results";

describe("resultsPhase", () => {
  it("maps each lifecycle state to the phase its viewers see", () => {
    expect(resultsPhase("live")).toBe("live");
    expect(resultsPhase("paused")).toBe("live");
    expect(resultsPhase("completed")).toBe("closed");
    expect(resultsPhase("cancelled")).toBe("closed");
    expect(resultsPhase("archived")).toBe("closed");
    expect(resultsPhase("draft")).toBe("setup");
    expect(resultsPhase("ready")).toBe("setup");
  });
});

describe("canViewPhoneNumbers", () => {
  it("always allows the Organizer", () => {
    for (const phase of ["live", "closed", "setup"] as const) {
      expect(
        canViewPhoneNumbers({
          isOnCallerRoster: false,
          phase,
          role: "organizer",
        }),
      ).toBe(true);
    }
  });

  it("allows a Representative while Live or Paused and afterwards only for its own Roster", () => {
    expect(
      canViewPhoneNumbers({
        isOnCallerRoster: false,
        phase: "live",
        role: "representative",
      }),
    ).toBe(true);
    expect(
      canViewPhoneNumbers({
        isOnCallerRoster: false,
        phase: "closed",
        role: "representative",
      }),
    ).toBe(false);
    expect(
      canViewPhoneNumbers({
        isOnCallerRoster: true,
        phase: "closed",
        role: "representative",
      }),
    ).toBe(true);
  });

  it("never allows an unrelated User", () => {
    for (const phase of ["live", "closed"] as const) {
      expect(
        canViewPhoneNumbers({
          isOnCallerRoster: true,
          phase,
          role: "unrelated",
        }),
      ).toBe(false);
    }
  });
});

describe("escapeSpreadsheetCell", () => {
  it("neutralizes every formula prefix before quoting", () => {
    for (const prefix of ["=", "+", "-", "@"]) {
      expect(escapeSpreadsheetCell(`${prefix}SUM(A1)`)).toBe(
        `"'${prefix}SUM(A1)"`,
      );
    }
    expect(escapeSpreadsheetCell("\t1+1")).toBe(`"'\t1+1"`);
  });

  it("keeps an ordinary value and escapes embedded quotes", () => {
    expect(escapeSpreadsheetCell("Alice")).toBe(`"Alice"`);
    expect(escapeSpreadsheetCell('Ali "The Wall"')).toBe(`"Ali ""The Wall"""`);
  });
});

describe("formatCsv", () => {
  it("joins rows with CRLF and terminates the document", () => {
    expect(
      formatCsv([
        ["Team", "Player"],
        ["=Reds", "Alice"],
      ]),
    ).toBe(`"Team","Player"\r\n"'=Reds","Alice"\r\n`);
  });
});

describe("exportFileName", () => {
  it("derives a safe attachment name", () => {
    expect(
      exportFileName({
        auctionTitle: "Winter Classic / 2026",
        extension: "csv",
      }),
    ).toBe("Winter-Classic-2026-results.csv");
    expect(exportFileName({ auctionTitle: "  ", extension: "pdf" })).toBe(
      "auction-results.pdf",
    );
  });

  it("exposes the hidden placeholder used by the UI", () => {
    expect(HIDDEN_PHONE).toBe("Hidden");
  });
});
