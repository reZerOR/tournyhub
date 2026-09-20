import { describe, expect, it } from "vitest";

import type { AuctionResultsView } from "@/domain/results";
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
      expect(text).not.toContain("8801112223");
      expect(text).toContain("(  Alice - Bid 10)");
      expect(text).toContain("(Reds - Roster 1");
    }
  });
});
