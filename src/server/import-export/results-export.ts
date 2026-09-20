import {
  exportFileName,
  formatCsv,
  type AuctionResultsView,
  type ResultsPlayerRow,
} from "@/domain/results";
import { writeAuditEntry } from "@/server/auction-command/live-command";
import { createTextPdf } from "@/server/import-export/pdf-writer";
import type { Queryable } from "@/server/database/queryable";

export { exportFileName };

const SOURCE_LABELS: Record<ResultsPlayerRow["source"], string> = {
  bid: "Bid",
  forced: "Forced Assignment",
  representative: "Player Representative",
};

export interface ResultsCsvExport {
  csv: string;
  phoneNumberCount: number;
  rowCount: number;
}

function phoneCount(rows: readonly (readonly string[])[]): number {
  // The phone column is the last one in both exports.
  return rows.filter((row) => (row[row.length - 1] ?? "").length > 0).length;
}

/**
 * The Results CSV for one caller.
 *
 * The Organizer receives one row per Player Entry, so every supplied phone
 * number is present, including Players who were never assigned. A Team
 * Representative receives only that Team's Roster, so another Team's contact
 * details never leave the server. Both exports neutralize spreadsheet formula
 * prefixes.
 */
export function buildResultsCsv(view: AuctionResultsView): ResultsCsvExport {
  const header = ["Team", "Player", "Source", "Amount", "Phone"];
  const rows: string[][] = [header];
  const phoneByPlayerId = new Map(
    view.contacts.map((contact) => [
      contact.playerEntryId,
      contact.phoneNumber,
    ]),
  );

  if (view.viewerRole === "representative") {
    const team = view.results.teams.find(
      (candidate) => candidate.id === view.viewerTeamId,
    );
    for (const player of team?.players ?? []) {
      rows.push([
        team?.name ?? "Unnamed Team",
        player.displayName,
        SOURCE_LABELS[player.source],
        player.source === "representative" ? "" : String(player.amount),
        phoneByPlayerId.get(player.playerEntryId) ?? "",
      ]);
    }
    return {
      csv: formatCsv(rows),
      phoneNumberCount: phoneCount(rows.slice(1)),
      rowCount: rows.length - 1,
    };
  }

  const placementByPlayerId = new Map<
    string,
    { amount: string; source: string }
  >();
  for (const team of view.results.teams) {
    for (const player of team.players) {
      placementByPlayerId.set(player.playerEntryId, {
        amount: player.source === "representative" ? "" : String(player.amount),
        source: SOURCE_LABELS[player.source],
      });
    }
  }
  for (const unsold of view.results.unsold) {
    placementByPlayerId.set(unsold.playerEntryId, {
      amount: "",
      source:
        unsold.resolution === "final_unsold" ? "Final Unsold" : "Unsold Pool",
    });
  }

  for (const contact of view.contacts) {
    const placement = placementByPlayerId.get(contact.playerEntryId);
    rows.push([
      contact.teamName ?? "Unassigned",
      contact.displayName,
      placement?.source ??
        (contact.isRepresentative ? "Representative" : "Unassigned"),
      placement?.amount ?? "",
      phoneByPlayerId.get(contact.playerEntryId) ?? "",
    ]);
  }

  return {
    csv: formatCsv(rows),
    phoneNumberCount: phoneCount(rows.slice(1)),
    rowCount: rows.length - 1,
  };
}

export interface ResultsPdfExport {
  lineCount: number;
  pdf: Buffer;
}

/**
 * The Results PDF. It never contains a phone number, whatever the requesting
 * role, so a shared document cannot expose private contact data.
 */
export function buildResultsPdf(view: AuctionResultsView): ResultsPdfExport {
  const lines: string[] = [
    `${view.title || "Auction"} - Results`,
    `Status: ${view.status}`,
    "",
  ];

  for (const team of view.results.teams) {
    const tierSummary = Object.entries(team.tierCounts)
      .map(
        ([key, count]) =>
          `${key === "unassigned" ? "Unassigned" : key}: ${count}`,
      )
      .join(", ");
    lines.push(
      `${team.name ?? "Unnamed Team"} - Roster ${team.rosterCount}, Spent ${team.spentCredits}, Remaining ${team.remainingBudget}`,
    );
    if (tierSummary) lines.push(`  Tiers: ${tierSummary}`);
    for (const player of team.players) {
      lines.push(
        `  ${player.displayName} - ${
          player.source === "representative"
            ? SOURCE_LABELS.representative
            : `${SOURCE_LABELS[player.source]} ${player.amount}`
        }`,
      );
    }
    lines.push("");
  }

  if (view.results.unsold.length > 0) {
    lines.push("Unsold Players");
    for (const unsold of view.results.unsold) {
      lines.push(
        `  ${unsold.displayName} - ${
          unsold.resolution === "final_unsold" ? "Final Unsold" : "Unsold Pool"
        }`,
      );
    }
  }

  return { lineCount: lines.length, pdf: createTextPdf(lines) };
}

/**
 * Records one Results export. The Audit Entry names the format, the caller's
 * role, the row count, and how many phone numbers the payload exposed — never a
 * phone number itself.
 */
export async function recordResultsExport(
  db: Queryable,
  {
    actorUserId,
    auctionId,
    format,
    phoneNumberCount,
    rowCount,
    viewerRole,
  }: {
    actorUserId: string;
    auctionId: string;
    format: "csv" | "pdf";
    phoneNumberCount: number;
    rowCount: number;
    viewerRole: "organizer" | "representative";
  },
): Promise<void> {
  await writeAuditEntry(db, {
    action: "export_results",
    actorUserId,
    auctionId,
    details: {
      format,
      phoneNumberCount,
      rowCount,
      viewerRole,
    },
  });
}
