/**
 * Auction Results and the phone-number policy.
 *
 * Phone numbers are sensitive Player data. This module is the single place that
 * decides who may see one, so the read model, the CSV export, the PDF export,
 * and the tests all agree.
 *
 * - The Organizer may always see every supplied phone number.
 * - A Team Representative may see every Player's phone number while the Auction
 *   is Live or Paused, because inspecting the current Player pool is part of
 *   operating a Team.
 * - Once the Auction is Completed or Cancelled, a Team Representative may see
 *   phone numbers only for Players on that Team's Roster.
 * - A PDF never contains a phone number, whatever the requesting role.
 */

export type ResultsPhase = "closed" | "live" | "setup";
export type ResultsRole = "organizer" | "representative" | "unrelated";

/** The phase the requesting User is viewing the Auction in. */
export function resultsPhase(status: string): ResultsPhase {
  if (status === "live" || status === "paused") return "live";
  if (
    status === "completed" ||
    status === "cancelled" ||
    status === "archived"
  ) {
    return "closed";
  }
  return "setup";
}

export function canViewPhoneNumbers({
  isOnCallerRoster,
  phase,
  role,
}: {
  isOnCallerRoster: boolean;
  phase: ResultsPhase;
  role: ResultsRole;
}): boolean {
  if (role === "organizer") return true;
  if (role !== "representative") return false;
  if (phase === "live") return true;
  if (phase === "closed") return isOnCallerRoster;
  return false;
}

/**
 * The placeholder shown instead of a withheld phone number. The value is
 * explicit, so a Reader can tell "not supplied" from "not allowed".
 */
export const HIDDEN_PHONE = "Hidden";

/** Where a Player joined a Team. */
export type ResultsSource = "bid" | "forced" | "representative";

export interface ResultsPlayerRow {
  amount: number;
  displayName: string;
  /** The supplied phone number, or null when none exists or it is withheld. */
  phoneNumber: null | string;
  playerEntryId: string;
  source: ResultsSource;
  tierId: null | string;
  tierLabel: null | string;
}

export interface ResultsTeamView {
  id: string;
  name: null | string;
  players: ResultsPlayerRow[];
  remainingBudget: number;
  rosterCount: number;
  spentCredits: number;
  /** Roster counts keyed by Tier id, plus `unassigned`. */
  tierCounts: Record<string, number>;
}

export interface ResultsContactRow {
  displayName: string;
  isRepresentative: boolean;
  /** A supplied phone number, or null when none exists or it is withheld. */
  phoneNumber: null | string;
  /** True when a phone number exists but this caller may not see it. */
  phoneWithheld: boolean;
  playerEntryId: string;
  teamId: null | string;
  teamName: null | string;
  tierLabel: null | string;
}

export interface ResultsUnsoldRow {
  displayName: string;
  playerEntryId: string;
  resolution: "final_unsold" | "open";
}

export interface AuctionResultsView {
  auctionId: string;
  /** Whether at least one phone number is present in this payload. */
  includesPhoneNumbers: boolean;
  phase: ResultsPhase;
  results: {
    teams: ResultsTeamView[];
    unsold: ResultsUnsoldRow[];
  };
  rulesMode: "simple" | "tiered";
  status: string;
  /** Player details, with phone numbers already filtered for this caller. */
  contacts: ResultsContactRow[];
  title: string;
  viewerRole: "organizer" | "representative";
  viewerTeamId: null | string;
}

/**
 * A CSV cell that cannot be interpreted as a spreadsheet formula. A value
 * starting with `=`, `+`, `-`, or `@` is neutralized with a leading apostrophe
 * before it is quoted, so an Organizer-supplied name can never execute.
 */
export function escapeSpreadsheetCell(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

/** Renders rows of cells as a CRLF-delimited CSV document. */
export function formatCsv(rows: readonly (readonly string[])[]): string {
  return `${rows
    .map((row) => row.map(escapeSpreadsheetCell).join(","))
    .join("\r\n")}\r\n`;
}

/** The `Content-Disposition` filename for one Results export. */
export function exportFileName({
  auctionTitle,
  extension,
}: {
  auctionTitle: string;
  extension: "csv" | "pdf";
}): string {
  const safe = auctionTitle
    .trim()
    .replace(/[^a-zA-Z0-9 _-]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${safe || "auction"}-results.${extension}`;
}
