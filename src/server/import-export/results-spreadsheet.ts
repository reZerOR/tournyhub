import {
  formatCsv,
  RESULTS_SOURCE_LABELS,
  resultsTeamColor,
  type AuctionResultsView,
  type ResultsTeamView,
} from "@/domain/results";

/** A URL Team filter may only narrow the already-authorized read model. */
export function scopeResultsExport(
  view: AuctionResultsView,
  teamId: null | string,
  format: "csv" | "xlsx" | "pdf",
): AuctionResultsView | null {
  if (teamId === null) return view;
  const team = view.results.teams.find((candidate) => candidate.id === teamId);
  if (!team) return null;
  if (
    format !== "pdf" &&
    view.viewerRole === "representative" &&
    teamId !== view.viewerTeamId
  )
    return null;
  return {
    ...view,
    contacts: view.contacts.filter((contact) => contact.teamId === teamId),
    results: { teams: [team], unsold: [] },
  };
}

interface RosterSection {
  name: string;
  color: string;
  summary: string;
  rows: string[][];
}

function spreadsheetData(view: AuctionResultsView) {
  const hasTiers = view.rulesMode === "tiered";
  const header = [
    "Team",
    "Player",
    ...(hasTiers ? ["Tier"] : []),
    "Source",
    "Amount",
    "Phone",
  ];
  const contacts = new Map(
    view.contacts.map((contact) => [contact.playerEntryId, contact]),
  );
  const teams =
    view.viewerRole === "representative"
      ? view.results.teams.filter((team) => team.id === view.viewerTeamId)
      : view.results.teams;
  const sections: RosterSection[] = teams.map((team: ResultsTeamView) => ({
    name: team.name ?? "Unnamed Team",
    color: resultsTeamColor(team.color),
    summary: `${team.rosterCount} players | Spent: ${team.spentCredits.toLocaleString("en-US")} cr | Remaining: ${team.remainingBudget.toLocaleString("en-US")} cr`,
    rows: team.players.map((player) => [
      team.name ?? "Unnamed Team",
      player.displayName,
      ...(hasTiers ? [player.tierLabel ?? "Unassigned"] : []),
      RESULTS_SOURCE_LABELS[player.source],
      player.source === "representative" ? "" : String(player.amount),
      contacts.get(player.playerEntryId)?.phoneWithheld
        ? ""
        : (contacts.get(player.playerEntryId)?.phoneNumber ?? ""),
    ]),
  }));
  if (view.viewerRole === "organizer") {
    const placed = new Set(
      teams.flatMap((team) =>
        team.players.map((player) => player.playerEntryId),
      ),
    );
    const unsold = new Map(
      view.results.unsold.map((player) => [
        player.playerEntryId,
        player.resolution,
      ]),
    );
    const unassigned = view.contacts.filter(
      (contact) => !placed.has(contact.playerEntryId),
    );
    if (unassigned.length)
      sections.push({
        name: "Unassigned players",
        color: "#64748b",
        summary: `${unassigned.length} players without a roster place`,
        rows: unassigned.map((contact) => [
          contact.teamName ?? "Unassigned",
          contact.displayName,
          ...(hasTiers ? [contact.tierLabel ?? "Unassigned"] : []),
          unsold.get(contact.playerEntryId) === "final_unsold"
            ? "Final Unsold"
            : unsold.has(contact.playerEntryId)
              ? "Unsold Pool"
              : "Unassigned",
          "",
          contact.phoneWithheld ? "" : (contact.phoneNumber ?? ""),
        ]),
      });
  }
  const rows = sections.flatMap((section) => section.rows);
  return {
    header,
    sections,
    rowCount: rows.length,
    phoneNumberCount: rows.filter((row) => row.at(-1)).length,
  };
}

export function buildGroupedResultsCsv(view: AuctionResultsView) {
  const { header, sections, rowCount, phoneNumberCount } =
    spreadsheetData(view);
  const pad = (row: string[]) => [
    ...row,
    ...Array<string>(header.length - row.length).fill(""),
  ];
  const rows = [
    pad([view.title || "Auction Results"]),
    pad([`${view.status} | ${view.rulesMode} rules`]),
  ];
  for (const section of sections) {
    rows.push(
      pad([]),
      pad([section.name]),
      pad([section.summary]),
      header,
      ...section.rows,
    );
  }
  return { csv: formatCsv(rows), rowCount, phoneNumberCount };
}

/** Real XLSX cells carry styling; strings are never interpreted as formulas. */
export async function buildResultsWorkbook(view: AuctionResultsView) {
  const { default: ExcelJS } = await import("exceljs");
  const { header, sections, rowCount, phoneNumberCount } =
    spreadsheetData(view);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TournyHub";
  const sheet = workbook.addWorksheet("Team rosters", {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  sheet.columns = header.map((label) => ({
    width:
      label === "Player"
        ? 32
        : label === "Source"
          ? 26
          : label === "Amount"
            ? 16
            : 24,
  }));
  const merged = (
    text: string,
    height: number,
    fill: string,
    color: string,
    size: number,
  ) => {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, header.length);
    row.height = height;
    const cell = row.getCell(1);
    cell.font = {
      name: "Calibri",
      size,
      bold: size >= 16,
      color: { argb: color },
    };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
  };
  merged(view.title || "Auction Results", 42, "FF142033", "FFFFFFFF", 22);
  merged(
    `${view.status} | ${view.rulesMode} rules | Team rosters`,
    26,
    "FF142033",
    "FFE2E8F0",
    11,
  );
  for (const section of sections) {
    sheet.addRow([]).height = 16;
    const rgb = section.color.slice(1);
    const channels = [0, 2, 4].map(
      (offset) => parseInt(rgb.slice(offset, offset + 2), 16) / 255,
    );
    const linear = channels.map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
    const luminance =
      linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
    merged(
      section.name,
      Math.max(40, Math.ceil(section.name.length / 70) * 24),
      `FF${rgb}`,
      luminance > 0.179 ? "FF000000" : "FFFFFFFF",
      18,
    );
    merged(section.summary, 30, "FFF1F5F9", "FF334155", 11);
    const heading = sheet.addRow(header);
    heading.height = 26;
    heading.eachCell((cell) => {
      cell.font = {
        name: "Calibri",
        size: 11,
        bold: true,
        color: { argb: "FF334155" },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
      };
      cell.alignment = { vertical: "middle" };
    });
    for (const [index, values] of section.rows.entries()) {
      const row = sheet.addRow(values);
      row.height = Math.max(
        30,
        Math.ceil(
          Math.max(
            ...values.map(
              (value, column) =>
                value.length / (sheet.getColumn(column + 1).width ?? 20),
            ),
          ),
        ) *
          16 +
          12,
      );
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        cell.font = { name: "Calibri", size: 11, color: { argb: "FF142033" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: index % 2 ? "FFF1F5F9" : "FFFFFFFF" },
        };
        cell.alignment = { vertical: "middle", wrapText: true };
        if (column === header.length - 1 && cell.value !== "") {
          cell.value = Number(values[column - 1]);
          cell.numFmt = '#,##0" cr"';
          cell.alignment.horizontal = "right";
        }
        if (column === header.length) cell.numFmt = "@";
      });
    }
    if (!section.rows.length)
      merged("No players acquired", 30, "FFFFFFFF", "FF334155", 11);
  }
  return {
    workbook: Buffer.from(await workbook.xlsx.writeBuffer()),
    rowCount,
    phoneNumberCount,
  };
}
