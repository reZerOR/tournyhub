import {
  exportFileName,
  RESULTS_SOURCE_LABELS,
  type AuctionResultsView,
  type ResultsTeamView,
} from "@/domain/results";
import { writeAuditEntry } from "@/server/auction-command/live-command";
import { buildGroupedResultsCsv } from "@/server/import-export/results-spreadsheet";
import {
  createStyledPdf,
  type PdfBlock,
} from "@/server/import-export/pdf-writer";
import type { Queryable } from "@/server/database/queryable";

export { exportFileName };

export interface ResultsCsvExport {
  csv: string;
  phoneNumberCount: number;
  rowCount: number;
}

/**
 * Derives a human-readable tier summary from a player list, using tierLabel
 * rather than the raw tier UUID keys in tierCounts.
 */
function buildTierSummary(players: ResultsTeamView["players"]): string {
  const counts = new Map<string, number>();
  for (const p of players) {
    const label = p.tierLabel ?? "Unassigned";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => `${label}: ${count}`)
    .join(", ");
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
  return buildGroupedResultsCsv(view);
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
  const hasTiers = view.rulesMode === "tiered";
  const totalPlayers = view.results.teams.reduce(
    (s, t) => s + t.rosterCount,
    0,
  );
  const totalSpent = view.results.teams.reduce((s, t) => s + t.spentCredits, 0);

  // ── Document sections ─────────────────────────────────────────────────────

  const blocks: PdfBlock[] = [];

  // Cover header
  blocks.push({ kind: "title", text: view.title || "Auction Results" });
  blocks.push({
    kind: "subtitle",
    text: `${view.rulesMode.charAt(0).toUpperCase()}${view.rulesMode.slice(1)} rules | Status: ${view.status.charAt(0).toUpperCase()}${view.status.slice(1)}`,
  });
  blocks.push({ kind: "rule" });
  blocks.push({ kind: "blank" });

  // Overall summary
  blocks.push({
    kind: "summary",
    cols: ["Teams", "Total Players", "Total Spent"],
    row: [
      String(view.results.teams.length),
      String(totalPlayers),
      `${totalSpent.toLocaleString()} cr`,
    ],
  });
  blocks.push({ kind: "blank" });
  // Keep the first roster with the overview; later Teams begin fresh sheets.
  for (const [index, team] of view.results.teams.entries()) {
    if (index > 0) blocks.push({ kind: "pageBreak" });
    blocks.push({
      kind: "teamBanner",
      text: team.name ?? "Unnamed Team",
      color: team.color,
      subtitle: view.title || "Auction Results",
    });
    blocks.push({
      kind: "summary",
      cols: ["Players", "Spent", "Remaining"],
      row: [
        String(team.rosterCount),
        `${team.spentCredits.toLocaleString("en-US")} cr`,
        `${team.remainingBudget.toLocaleString("en-US")} cr`,
      ],
    });
    const tierSummary = buildTierSummary(team.players);
    if (hasTiers && tierSummary)
      blocks.push({ kind: "kv", label: "Tiers", value: tierSummary });
    blocks.push({ kind: "blank" });
    blocks.push({ kind: "columns", hasTiers });
    if (!team.players.length)
      blocks.push({ kind: "subtitle", text: "No players acquired." });

    // Player rows
    for (const [idx, player] of team.players.entries()) {
      blocks.push({
        kind: "player",
        index: idx + 1,
        name: player.displayName,
        source: RESULTS_SOURCE_LABELS[player.source],
        amount:
          player.source === "representative"
            ? "-"
            : `${player.amount.toLocaleString()} cr`,
        ...(hasTiers ? { tier: player.tierLabel ?? "Unassigned" } : {}),
      });
    }

    blocks.push({ kind: "blank" });
    blocks.push({ kind: "rule" });
    blocks.push({ kind: "blank" });
  }

  // Unsold section
  if (view.results.unsold.length > 0) {
    blocks.push({ kind: "heading", text: "Unsold Players", color: null });
    for (const unsold of view.results.unsold) {
      blocks.push({
        kind: "unsold",
        name: unsold.displayName,
        resolution:
          unsold.resolution === "final_unsold" ? "Final Unsold" : "Unsold Pool",
      });
    }
    blocks.push({ kind: "blank" });
    blocks.push({ kind: "rule" });
    blocks.push({ kind: "blank" });
  }

  // Footer note
  blocks.push({
    kind: "footer",
    text: "Phone numbers are never included in this PDF. Download the CSV for contact details.",
  });

  return {
    lineCount: blocks.length,
    pdf: createStyledPdf(blocks),
  };
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
    format: "csv" | "pdf" | "xlsx";
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
