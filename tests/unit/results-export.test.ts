import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import type { AuctionResultsView } from "@/domain/results";
import { teamRosterText } from "@/domain/results";
import {
  buildResultsWorkbook,
  scopeResultsExport,
} from "@/server/import-export/results-spreadsheet";
import { createTextPdf } from "@/server/import-export/pdf-writer";
import {
  buildResultsCsv,
  buildResultsPdf,
} from "@/server/import-export/results-export";

function view(overrides: Partial<AuctionResultsView> = {}): AuctionResultsView {
  return {
    auctionId: "auction-1",
    contacts: [],
    includesPhoneNumbers: false,
    phase: "closed",
    results: { teams: [], unsold: [] },
    rulesMode: "simple",
    status: "completed",
    title: "Winter Classic",
    viewerRole: "organizer",
    viewerTeamId: null,
    ...overrides,
  };
}

describe("createTextPdf", () => {
  it("produces a parseable document whose startxref points at the table", () => {
    const pdf = createTextPdf(["Auction Results", "Reds - Alice 10"]);
    const text = pdf.toString("latin1");

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);

    const startxref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    expect(text).toContain("(Reds - Alice 10)");
  });

  it("paginates long documents", () => {
    const pdf = createTextPdf(
      Array.from({ length: 200 }, (_, index) => `Line ${index}`),
    );
    const text = pdf.toString("latin1");
    const pageCount = Number(
      text.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)![1],
    );
    expect(pageCount).toBeGreaterThan(1);
    expect(text.match(/\/Type \/Page[^s]/g)!.length).toBe(pageCount);
  });

  it("replaces characters outside printable ASCII rather than corrupting the file", () => {
    const pdf = createTextPdf(["José 🎯"]).toString("latin1");
    expect(pdf).toContain("(Jos? ??)");
  });
});

describe("buildResultsCsv", () => {
  const base = view({
    contacts: [
      {
        displayName: "Alice",
        isRepresentative: false,
        phoneNumber: "+880111",
        phoneWithheld: false,
        playerEntryId: "p-alice",
        teamId: "t-reds",
        teamName: "Reds",
        tierLabel: null,
      },
      {
        displayName: "Bob",
        isRepresentative: false,
        phoneNumber: "+880222",
        phoneWithheld: false,
        playerEntryId: "p-bob",
        teamId: "t-blues",
        teamName: "Blues",
        tierLabel: null,
      },
    ],
    results: {
      teams: [
        {
          id: "t-reds",
          color: null,
          name: "Reds",
          players: [
            {
              amount: 0,
              displayName: "Rep One",
              phoneNumber: "+880000",
              playerEntryId: "p-rep",
              source: "representative",
              tierId: null,
              tierLabel: null,
            },
            {
              amount: 10,
              displayName: "Alice",
              phoneNumber: "+880111",
              playerEntryId: "p-alice",
              source: "bid",
              tierId: null,
              tierLabel: null,
            },
          ],
          remainingBudget: 90,
          rosterCount: 2,
          spentCredits: 10,
          tierCounts: {},
        },
        {
          id: "t-blues",
          color: null,
          name: "Blues",
          players: [
            {
              amount: 15,
              displayName: "Bob",
              phoneNumber: "+880222",
              playerEntryId: "p-bob",
              source: "forced",
              tierId: null,
              tierLabel: null,
            },
          ],
          remainingBudget: 85,
          rosterCount: 1,
          spentCredits: 15,
          tierCounts: {},
        },
      ],
      unsold: [
        {
          displayName: "Carol",
          playerEntryId: "p-carol",
          resolution: "final_unsold",
        },
      ],
    },
  });

  it("groups CSV rosters under team headings without dropping representatives", () => {
    const { csv, rowCount } = buildResultsCsv(base);
    expect(csv.indexOf('"Reds","",""')).toBeLessThan(
      csv.indexOf('"Reds","Rep One"'),
    );
    expect(csv.indexOf('"Reds","Alice"')).toBeLessThan(
      csv.indexOf('"Blues","",""'),
    );
    expect(rowCount).toBe(3);
  });

  it("narrows exports to one team and rejects forged contact scopes", () => {
    const scoped = scopeResultsExport(base, "t-reds", "csv")!;
    expect(buildResultsCsv(scoped).csv).not.toContain("Bob");
    expect(buildResultsPdf(scoped).pdf.toString("latin1")).not.toContain("Bob");
    const representative = {
      ...base,
      viewerRole: "representative" as const,
      viewerTeamId: "t-reds",
    };
    for (const format of ["csv", "xlsx"] as const) {
      expect(scopeResultsExport(representative, "t-blues", format)).toBeNull();
      expect(
        scopeResultsExport(representative, "t-reds", format),
      ).not.toBeNull();
    }
    expect(scopeResultsExport(representative, "t-blues", "pdf")).not.toBeNull();
    expect(scopeResultsExport(base, "missing", "pdf")).toBeNull();
    expect(scopeResultsExport(base, "", "csv")).toBeNull();
  });

  it("writes centered colored Excel headings and literal phone/name cells", async () => {
    const colored = structuredClone(base);
    colored.results.teams[0]!.color = "#00ffff";
    colored.results.teams[0]!.players[0]!.displayName = "=1+1";
    const exported = await buildResultsWorkbook(colored);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.workbook as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0]!;
    const cells: ExcelJS.Cell[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => cells.push(cell)));
    const title = cells.find((cell) => cell.value === "Reds" && cell.isMerged)!;
    expect(title.alignment.horizontal).toBe("center");
    expect(title.fill).toMatchObject({ fgColor: { argb: "FF00ffff" } });
    const formulaName = cells.find((cell) => cell.value === "=1+1")!;
    expect(formulaName.type).toBe(ExcelJS.ValueType.String);
    expect(cells.some((cell) => cell.value === "+880111")).toBe(true);
    expect(
      cells.some((cell) => cell.value === 10 && cell.numFmt.includes("cr")),
    ).toBe(true);
    expect(exported.rowCount).toBe(3);
    expect(exported.phoneNumberCount).toBe(2);
    const own = await buildResultsWorkbook({
      ...base,
      viewerRole: "representative",
      viewerTeamId: "t-reds",
    });
    const ownBook = new ExcelJS.Workbook();
    await ownBook.xlsx.load(own.workbook as unknown as ExcelJS.Buffer);
    expect(
      JSON.stringify(ownBook.worksheets[0]!.getSheetValues()),
    ).not.toContain("Bob");
    expect(own.phoneNumberCount).toBe(1);
  });

  it("copies the selected roster without any phone numbers or other teams", () => {
    const copied = teamRosterText(
      base.title,
      base.results.teams[0]!,
      base.rulesMode,
    );
    expect(copied).toContain("1. Rep One");
    expect(copied).toContain("2. Alice");
    expect(copied).not.toContain("Bob");
    expect(copied).not.toContain("880");
  });

  it("repeats team and column headings when a PDF roster spans pages", () => {
    const large = structuredClone(base);
    const team = large.results.teams[0]!;
    team.players = Array.from({ length: 80 }, (_, index) => ({
      ...team.players[1]!,
      displayName: `Player ${index}`,
      playerEntryId: `p-${index}`,
    }));
    team.rosterCount = 80;
    const text = buildResultsPdf(large).pdf.toString("latin1");
    expect(text).toContain("Reds \\(continued\\)");
    expect(text.match(/\(PLAYER\)/g)!.length).toBeGreaterThan(2);
    expect(text).toContain("Player 79");
    expect(text).not.toContain("Champion");
    expect(text).not.toContain("880");
    expect(text.slice(Number(text.match(/startxref\n(\d+)/)![1]), -1)).toMatch(
      /^xref/,
    );
  });

  it("gives the Organizer every supplied phone number including unassigned Players", () => {
    const csv = buildResultsCsv({
      ...base,
      contacts: [
        ...base.contacts,
        {
          displayName: "Carol",
          isRepresentative: false,
          phoneNumber: "+880333",
          phoneWithheld: false,
          playerEntryId: "p-carol",
          teamId: null,
          teamName: null,
          tierLabel: null,
        },
      ],
    });

    // A leading "+" is a spreadsheet formula marker, so it is neutralized too.
    expect(csv.csv).toContain(`"'+880111"`);
    expect(csv.csv).toContain(`"'+880222"`);
    expect(csv.csv).toContain(`"'+880333"`);
    expect(csv.csv).toContain('"Unassigned","Carol"');
    expect(csv.csv).toContain('"Final Unsold"');
    expect(csv.phoneNumberCount).toBe(3);
  });

  it("scopes a Representative export to its own Roster", () => {
    const csv = buildResultsCsv({
      ...base,
      viewerRole: "representative",
      viewerTeamId: "t-reds",
    });

    expect(csv.csv).toContain('"Reds","Alice"');
    expect(csv.csv).not.toContain("Bob");
    expect(csv.csv).not.toContain("+880222");
    expect(csv.csv).not.toContain("Carol");
    expect(csv.phoneNumberCount).toBe(1);
  });

  it("neutralizes a formula prefix in a Player name", () => {
    const csv = buildResultsCsv({
      ...base,
      contacts: [
        {
          displayName: "=cmd|' /C calc'!A0",
          isRepresentative: false,
          phoneNumber: null,
          phoneWithheld: false,
          playerEntryId: "p-evil",
          teamId: "t-reds",
          teamName: "Reds",
          tierLabel: null,
        },
      ],
      results: {
        teams: [
          {
            id: "t-reds",
            color: null,
            name: "Reds",
            players: [
              {
                amount: 5,
                displayName: "=cmd|' /C calc'!A0",
                phoneNumber: null,
                playerEntryId: "p-evil",
                source: "bid",
                tierId: null,
                tierLabel: null,
              },
            ],
            remainingBudget: 95,
            rosterCount: 1,
            spentCredits: 5,
            tierCounts: {},
          },
        ],
        unsold: [],
      },
    });

    expect(csv.csv).toContain(`"'=cmd|' /C calc'!A0"`);
  });
});

describe("buildResultsPdf", () => {
  it("never contains a phone number, whatever the role", () => {
    const withPhones = view({
      contacts: [
        {
          displayName: "Alice",
          isRepresentative: false,
          phoneNumber: "+8801112223",
          phoneWithheld: false,
          playerEntryId: "p-alice",
          teamId: "t-reds",
          teamName: "Reds",
          tierLabel: null,
        },
      ],
      results: {
        teams: [
          {
            id: "t-reds",
            color: null,
            name: "Reds",
            players: [
              {
                amount: 10,
                displayName: "Alice",
                phoneNumber: "+8801112223",
                playerEntryId: "p-alice",
                source: "bid",
                tierId: null,
                tierLabel: null,
              },
            ],
            remainingBudget: 90,
            rosterCount: 1,
            spentCredits: 10,
            tierCounts: {},
          },
        ],
        unsold: [],
      },
    });

    for (const viewerRole of ["organizer", "representative"] as const) {
      const text = buildResultsPdf({ ...withPhones, viewerRole }).pdf.toString(
        "latin1",
      );
      // The phone number must never appear in the PDF.
      expect(text).not.toContain("8801112223");
      // Player name and team name must appear.
      expect(text).toContain("Alice");
      expect(text).toContain("Reds");
      // The bid amount must appear.
      expect(text).toContain("10");
    }
  });
});
