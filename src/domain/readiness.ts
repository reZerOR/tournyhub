import {
  evaluateLegalCompletion,
  type CompletionTeam,
} from "@/domain/legal-completion";
import { normalizeTeamName } from "@/domain/team";
import { isSimpleRuleSetComplete, type AuctionRuleSet } from "@/domain/rules";

export const READINESS_GROUPS = [
  "teams",
  "players",
  "rules",
  "invitations",
  "feasibility",
] as const;

export type ReadinessGroup = (typeof READINESS_GROUPS)[number];

export interface ReadinessIssue {
  group: ReadinessGroup;
  /** The setup section that repairs this issue. */
  href: string;
  message: string;
}

export interface ReadinessTeam {
  id: string;
  name: null | string;
  preassignedCount: number;
  representativeUserId: null | string;
}

export interface ReadinessInput {
  auctionId: string;
  /** Representative Users with no active session, warned about but not blocked. */
  disconnectedRepresentativeUserIds: readonly string[];
  /** Players still available for bidding, with their resolved Starting Price. */
  players: readonly { startingPrice: number }[];
  ruleSet: AuctionRuleSet;
  teams: readonly ReadinessTeam[];
}

export interface Readiness {
  errors: ReadinessIssue[];
  ready: boolean;
  warnings: ReadinessIssue[];
}

function setupHref(auctionId: string, section: string): string {
  return `/app/auctions/${auctionId}/setup/${section}`;
}

/**
 * Readiness for Simple Rules. It is derived from current data rather than a
 * stored flag, so any later edit that breaks a rule removes Ready.
 */
export function evaluateReadiness(input: ReadinessInput): Readiness {
  const {
    auctionId,
    disconnectedRepresentativeUserIds,
    players,
    ruleSet,
    teams,
  } = input;

  const errors: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];

  if (teams.length < 2) {
    errors.push({
      group: "teams",
      href: setupHref(auctionId, "teams"),
      message: "An Auction needs at least two Teams.",
    });
  }

  const unnamed = teams.filter((team) => team.name === null);
  if (unnamed.length > 0) {
    errors.push({
      group: "teams",
      href: setupHref(auctionId, "teams"),
      message: `${unnamed.length} Team${unnamed.length === 1 ? " needs a name" : "s need names"} before the Auction can start.`,
    });
  }

  const names = new Map<string, number>();
  for (const team of teams) {
    if (team.name === null) continue;
    const key = normalizeTeamName(team.name);
    names.set(key, (names.get(key) ?? 0) + 1);
  }
  if ([...names.values()].some((count) => count > 1)) {
    errors.push({
      group: "teams",
      href: setupHref(auctionId, "teams"),
      message:
        "Two Teams share the same name after normalization. Rename one of them.",
    });
  }

  const withoutRepresentative = teams.filter(
    (team) => team.representativeUserId === null,
  );
  if (withoutRepresentative.length > 0) {
    errors.push({
      group: "invitations",
      href: setupHref(auctionId, "representatives"),
      message: `${withoutRepresentative.length} Team${
        withoutRepresentative.length === 1 ? " has" : "s have"
      } no accepted representative.`,
    });
  } else {
    const disconnected = new Set(disconnectedRepresentativeUserIds);
    const disconnectedTeams = teams.filter(
      (team) =>
        team.representativeUserId !== null &&
        disconnected.has(team.representativeUserId),
    );
    if (disconnectedTeams.length > 0) {
      warnings.push({
        group: "invitations",
        href: setupHref(auctionId, "representatives"),
        message: `${disconnectedTeams.length} representative${
          disconnectedTeams.length === 1 ? " has" : "s have"
        } no active session and may be disconnected when the Auction starts.`,
      });
    }
  }

  const playerEntryCount =
    players.length +
    teams.reduce((total, team) => total + team.preassignedCount, 0);
  if (playerEntryCount === 0) {
    errors.push({
      group: "players",
      href: setupHref(auctionId, "players"),
      message: "Add Player Entries before the Auction can start.",
    });
  }

  const rulesComplete = isSimpleRuleSetComplete(ruleSet);
  if (!rulesComplete) {
    errors.push({
      group: "rules",
      href: setupHref(auctionId, "rules"),
      message:
        "Finish the Rules: Budget, Bid Increment, Roster minimum and maximum, and a default Starting Price.",
    });
  }

  const readyTeams =
    teams.length >= 2 &&
    unnamed.length === 0 &&
    withoutRepresentative.length === 0;

  if (rulesComplete && readyTeams && playerEntryCount > 0) {
    const completionTeams: CompletionTeam[] = teams.map((team) => ({
      budget: ruleSet.budget,
      preassignedCount: team.preassignedCount,
      spent: 0,
    }));
    const completion = evaluateLegalCompletion({
      players,
      rosterMax: ruleSet.rosterMax,
      rosterMin: ruleSet.rosterMin,
      teams: completionTeams,
    });
    if (!completion.possible) {
      errors.push({
        group: "feasibility",
        href: setupHref(auctionId, "readiness"),
        message: `No Legal Completion exists. ${completion.reason}`,
      });
    }
  }

  return { errors, ready: errors.length === 0, warnings };
}
