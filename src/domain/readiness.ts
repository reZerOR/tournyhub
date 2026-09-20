import type { RulesMode } from "@/domain/auction";
import {
  evaluateLegalCompletion,
  type CompletionTeam,
} from "@/domain/legal-completion";
import { normalizeTeamName } from "@/domain/team";
import {
  isSimpleRuleSetComplete,
  isTieredRuleSetComplete,
  type AuctionRuleSet,
} from "@/domain/rules";
import { evaluateTieredCompletion } from "@/domain/tiered-completion";
import { sumTierMaximums, sumTierMinimums } from "@/domain/tier";

export const READINESS_GROUPS = [
  "teams",
  "players",
  "rules",
  "tiers",
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
  /** Preassigned Player Representatives per Tier id, for Tiered Rules. */
  preassignedByTier?: Record<string, number>;
  representativeUserId: null | string;
}

export interface ReadinessTier {
  id: string;
  label: string;
  maxPerTeam: number;
  minPerTeam: number;
  position: number;
  startingPrice: number;
}

export interface ReadinessPlayer {
  startingPrice: number;
  /** The Tier this Player belongs to, for Tiered Rules. */
  tierId?: null | string;
}

export interface ReadinessInput {
  auctionId: string;
  /** Representative Users with no active session, warned about but not blocked. */
  disconnectedRepresentativeUserIds: readonly string[];
  /** Players still available for bidding, with their resolved Starting Price. */
  players: readonly ReadinessPlayer[];
  ruleSet: AuctionRuleSet;
  rulesMode?: RulesMode;
  teams: readonly ReadinessTeam[];
  tiers?: readonly ReadinessTier[];
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
 * The Feasibility group is the one place Readiness and the live Bidding path
 * share the Legal Completion engine. Both call this so they always agree.
 */
export function tieredFeasibilityIssues(
  input: ReadinessInput,
  tiers: readonly ReadinessTier[],
  rosterMin: number,
  rosterMax: number,
  budget: number,
): null | string {
  const tierIndexById = new Map(tiers.map((tier, index) => [tier.id, index]));
  const completionPlayers = input.players
    .filter((player) => player.tierId && tierIndexById.has(player.tierId))
    .map((player) => ({
      startingPrice: player.startingPrice,
      tierIndex: tierIndexById.get(player.tierId!)!,
    }));

  const completionTeams = input.teams.map((team) => ({
    budget,
    preassignedByTier: tiers.map(
      (tier) => team.preassignedByTier?.[tier.id] ?? 0,
    ),
    // Player Representatives may have no Tier, so the caller supplies the true
    // Roster total rather than letting it be inferred from the per-Tier counts.
    preassignedTotal: team.preassignedCount,
    spent: 0,
  }));

  const result = evaluateTieredCompletion({
    players: completionPlayers,
    rosterMax,
    rosterMin,
    teams: completionTeams,
    tiers: tiers.map((tier) => ({
      label: tier.label,
      maxPerTeam: tier.maxPerTeam,
      minPerTeam: tier.minPerTeam,
    })),
  });

  return result.possible ? null : result.reason;
}

/**
 * Readiness for both Rule modes. It is derived from current data rather than a
 * stored flag, so any later edit that breaks a rule removes Ready.
 */
export function evaluateReadiness(input: ReadinessInput): Readiness {
  const {
    auctionId,
    disconnectedRepresentativeUserIds,
    players,
    rulesMode = "simple",
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

  const readyTeams =
    teams.length >= 2 &&
    unnamed.length === 0 &&
    withoutRepresentative.length === 0;

  if (rulesMode === "tiered") {
    evaluateTieredReadiness({
      auctionId,
      errors,
      input,
      playerEntryCount,
      readyTeams,
    });
  } else {
    evaluateSimpleReadiness({ auctionId, errors, input, playerEntryCount });
  }

  return { errors, ready: errors.length === 0, warnings };
}

function evaluateSimpleReadiness({
  auctionId,
  errors,
  input,
  playerEntryCount,
}: {
  auctionId: string;
  errors: ReadinessIssue[];
  input: ReadinessInput;
  playerEntryCount: number;
}): void {
  const { players, ruleSet, teams } = input;

  const rulesComplete = isSimpleRuleSetComplete(ruleSet);
  if (!rulesComplete) {
    errors.push({
      group: "rules",
      href: setupHref(auctionId, "rules"),
      message:
        "Finish the Rules: Budget, Bid Increment, Roster minimum and maximum, and a default Starting Price.",
    });
  }

  if (rulesComplete && teams.length >= 2 && playerEntryCount > 0) {
    const completionTeams: CompletionTeam[] = teams.map((team) => ({
      budget: ruleSet.budget,
      preassignedCount: team.preassignedCount,
      spent: 0,
    }));
    const completion = evaluateLegalCompletion({
      players: players.map((player) => ({
        startingPrice: player.startingPrice,
      })),
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
}

function evaluateTieredReadiness({
  auctionId,
  errors,
  input,
  playerEntryCount,
  readyTeams,
}: {
  auctionId: string;
  errors: ReadinessIssue[];
  input: ReadinessInput;
  playerEntryCount: number;
  readyTeams: boolean;
}): void {
  const { players, ruleSet } = input;
  const tiers = [...(input.tiers ?? [])].sort(
    (left, right) => left.position - right.position,
  );

  const rulesComplete = isTieredRuleSetComplete(ruleSet);
  if (!rulesComplete) {
    errors.push({
      group: "rules",
      href: setupHref(auctionId, "rules"),
      message:
        "Finish the Rules: Budget, Bid Increment, and Roster minimum and maximum.",
    });
  }

  if (tiers.length === 0) {
    errors.push({
      group: "tiers",
      href: setupHref(auctionId, "tiers"),
      message: "Add at least one Tier before a Tiered Auction can start.",
    });
    return;
  }

  const tierById = new Map(tiers.map((tier) => [tier.id, tier]));
  const missingTier = players.filter(
    (player) => !player.tierId || !tierById.has(player.tierId),
  );
  if (missingTier.length > 0) {
    errors.push({
      group: "tiers",
      href: setupHref(auctionId, "tiers"),
      message: `${missingTier.length} Player${
        missingTier.length === 1 ? " needs" : "s need"
      } a Tier before a Tiered Auction can start.`,
    });
  }

  if (rulesComplete) {
    if (sumTierMinimums(tiers) > ruleSet.rosterMax) {
      errors.push({
        group: "tiers",
        href: setupHref(auctionId, "tiers"),
        message:
          "Tier minimums ask for more Players than the maximum Roster size.",
      });
    }
    const tierMaximumSum = sumTierMaximums(tiers);
    // A Team also holds its preassigned Player Representatives, which may sit
    // outside every Tier, so they count toward whether the minimum is reachable.
    const teamsBelowMinimum = input.teams.filter(
      (team) => team.preassignedCount + tierMaximumSum < ruleSet.rosterMin,
    );
    if (teamsBelowMinimum.length > 0) {
      errors.push({
        group: "tiers",
        href: setupHref(auctionId, "tiers"),
        message:
          "Tier maximums plus preassigned Players cannot reach the minimum Roster size for a Team.",
      });
    }
    for (const tier of tiers) {
      if (tier.maxPerTeam > ruleSet.rosterMax) {
        errors.push({
          group: "tiers",
          href: setupHref(auctionId, "tiers"),
          message: `The "${tier.label}" Tier maximum exceeds the maximum Roster size.`,
        });
      }
    }
  }

  if (
    rulesComplete &&
    readyTeams &&
    playerEntryCount > 0 &&
    missingTier.length === 0
  ) {
    const reason = tieredFeasibilityIssues(
      input,
      tiers,
      ruleSet.rosterMin,
      ruleSet.rosterMax,
      ruleSet.budget,
    );
    if (reason) {
      errors.push({
        group: "feasibility",
        href: setupHref(auctionId, "readiness"),
        message: `No Legal Completion exists. ${reason}`,
      });
    }
  }
}
