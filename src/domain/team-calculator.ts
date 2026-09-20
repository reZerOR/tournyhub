import { z } from "zod";

import { PLAYER_ENTRY_LIMITS } from "@/domain/player-entry";
import { TEAM_LIMITS } from "@/domain/team";

/**
 * One Auction can hold at most 2,000 Player Entries, so a Roster cannot be
 * larger than that.
 */
const rosterSize = z.coerce
  .number()
  .int("Enter a whole number.")
  .min(1, "Roster sizes must be at least 1.")
  .max(
    PLAYER_ENTRY_LIMITS.maxEntriesPerAuction,
    `Roster sizes must be at most ${PLAYER_ENTRY_LIMITS.maxEntriesPerAuction}.`,
  );

export const calculateTeamsInputSchema = z
  .object({
    maxRosterSize: rosterSize,
    minRosterSize: rosterSize,
    playerCount: z.coerce.number().int().min(0),
    preassignedRepresentativeCount: z.coerce.number().int().min(0),
  })
  .refine((value) => value.minRosterSize <= value.maxRosterSize, {
    message: "Minimum Roster size cannot exceed the maximum.",
    path: ["minRosterSize"],
  });

export type CalculateTeamsInput = z.input<typeof calculateTeamsInputSchema>;

export interface TeamCountResult {
  /** True when at least one Team count can hold the whole Player pool. */
  feasibleCounts: number[];
  /** A short sentence explaining an empty result. Empty when feasible. */
  explanation: string;
  /** The recommended count, or null when no count is feasible. */
  recommendation: null | number;
}

/**
 * Every Team count that can hold the current Player pool while letting each
 * Team reach its minimum, plus one recommendation.
 *
 * A count `t` is feasible when the Auction has at least two and at most 32
 * Teams, every preassigned Player Representative fits on its own Team
 * (`t >= representatives`), every Team can reach the minimum
 * (`t * min <= playerCount`), and the Teams can hold the whole pool
 * (`t * max >= playerCount`). Those conditions bound the count from both
 * sides, so the feasible counts are one contiguous interval.
 */
export function calculateFeasibleTeamCounts(
  input: CalculateTeamsInput,
): TeamCountResult {
  const {
    maxRosterSize,
    minRosterSize,
    playerCount,
    preassignedRepresentativeCount,
  } = calculateTeamsInputSchema.parse(input);

  const lowest = Math.max(
    2,
    preassignedRepresentativeCount,
    Math.ceil(playerCount / maxRosterSize),
  );
  const highest = Math.min(
    TEAM_LIMITS.maxTeams,
    Math.floor(playerCount / minRosterSize),
  );

  if (lowest > highest) {
    return {
      explanation: explainInfeasible({
        highest,
        lowest,
        maxRosterSize,
        minRosterSize,
        playerCount,
        preassignedRepresentativeCount,
      }),
      feasibleCounts: [],
      recommendation: null,
    };
  }

  const feasibleCounts: number[] = [];
  for (let count = lowest; count <= highest; count += 1) {
    feasibleCounts.push(count);
  }

  // Prefer the beta's 16-Team recommendation, but never recommend a count
  // outside the feasible range.
  const recommendation = Math.min(
    Math.max(TEAM_LIMITS.recommendedMaxTeams, lowest),
    highest,
  );

  return { explanation: "", feasibleCounts, recommendation };
}

function explainInfeasible({
  highest,
  lowest,
  maxRosterSize,
  minRosterSize,
  playerCount,
  preassignedRepresentativeCount,
}: {
  highest: number;
  lowest: number;
  maxRosterSize: number;
  minRosterSize: number;
  playerCount: number;
  preassignedRepresentativeCount: number;
}): string {
  if (playerCount < 2 * minRosterSize) {
    return `No Team count works: ${playerCount} Player${
      playerCount === 1 ? "" : "s"
    } cannot fill two Teams with a minimum Roster size of ${minRosterSize}.`;
  }
  if (Math.ceil(playerCount / maxRosterSize) > TEAM_LIMITS.maxTeams) {
    return `No Team count works: ${playerCount} Players need more than the ${TEAM_LIMITS.maxTeams}-Team limit. Raise the maximum Roster size or remove Players.`;
  }
  if (preassignedRepresentativeCount > TEAM_LIMITS.maxTeams) {
    return `No Team count works: ${preassignedRepresentativeCount} preassigned Player Representatives exceed the ${TEAM_LIMITS.maxTeams}-Team limit.`;
  }
  return `No Team count works between ${lowest} and ${highest} Teams for ${playerCount} Players and a Roster size of ${minRosterSize} to ${maxRosterSize}.`;
}
