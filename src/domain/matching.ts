/**
 * Constrained random matching for the Unsold Pool.
 *
 * When an Unsold Round closes with several deficient Teams and eligible
 * Players, the Organizer asks the system to resolve the minimums instead of
 * choosing pairings by hand. This module computes the assignments.
 *
 * It only ever reports a complete assignment it has actually constructed: an
 * assignment that fills every Team's remaining total and Tier minimums while
 * staying inside that Team's remaining Budget, total capacity, and Tier
 * capacity. Callers therefore never act on an infeasible pairing.
 *
 * The engine is deterministic for a fixed `random` source. The server supplies
 * cryptographically secure randomness, so the choice among equally feasible
 * assignments cannot be predicted by a participant.
 */

export interface MatchingPlayer {
  id: string;
  startingPrice: number;
  /** The index of this Player's Tier, or -1 when the Auction has no Tiers. */
  tierIndex: number;
}

export interface MatchingTeam {
  /** The Team's total Budget in Credits. */
  budget: number;
  id: string;
  /** Players already on the Team's Roster per Tier, including preassigned ones. */
  preassignedByTier: readonly number[];
  /**
   * Every Player already on the Team's Roster. A Player Representative may
   * belong to no Tier, so this can exceed the per-Tier sum.
   */
  preassignedTotal: number;
  /** Credits already committed by the Team. */
  spent: number;
}

export interface MatchingTier {
  label: string;
  maxPerTeam: number;
  minPerTeam: number;
}

export interface MatchingInput {
  players: readonly MatchingPlayer[];
  /** Injectable randomness. Returns [0, 1). */
  random?: () => number;
  rosterMax: number;
  rosterMin: number;
  teams: readonly MatchingTeam[];
  tiers: readonly MatchingTier[];
}

export interface MatchingAssignment {
  playerId: string;
  teamId: string;
}

export type MatchingResult =
  | { assignments: MatchingAssignment[]; possible: true }
  | { possible: false; reason: string };

/** How many allocation nodes the exact search may visit. */
export const MATCHING_NODE_BUDGET = 20_000;

/** How many complete assignments the exact search records before it stops. */
export const MATCHING_MAX_ASSIGNMENTS = 8;

/** How many randomized constructions to try when the exact search is exhausted. */
export const MATCHING_RANDOM_ATTEMPTS = 200;

const UNFEASIBLE_REASON =
  "No complete assignment satisfies every Team's Budget, minimums, and maximums.";

interface TeamState {
  budget: number;
  capacity: number[];
  capacityTotal: number;
  id: string;
  need: number[];
  /**
   * Remaining total Roster minimum slots that no Tier minimum covers. A Team
   * may hold more Players than its Tier minimums require.
   */
  needExtra: number;
  needTotal: number;
}

interface Prepared {
  players: { id: string; price: number; tierIndex: number }[];
  requiredInTier: number[];
  teams: TeamState[];
  tiers: MatchingTier[];
  totalRequired: number;
}

function isPrepared(value: MatchingResult | Prepared): value is Prepared {
  return "players" in value;
}

/**
 * Normalizes Simple Rules into a single Roster-shaped Tier so one engine
 * covers both Rule modes, then rejects a snapshot that fails a necessary
 * condition before any search runs.
 */
function prepare(input: MatchingInput): MatchingResult | Prepared {
  const tiered = input.tiers.length > 0;
  const tiers: MatchingTier[] = tiered
    ? [...input.tiers]
    : [
        {
          label: "Roster",
          maxPerTeam: input.rosterMax,
          minPerTeam: input.rosterMin,
        },
      ];
  const tierCount = tiers.length;

  const states: TeamState[] = [];
  for (const team of input.teams) {
    const preassignedByTier = tiered
      ? tiers.map((_, index) => team.preassignedByTier[index] ?? 0)
      : [team.preassignedTotal];
    const capacityTotal = input.rosterMax - team.preassignedTotal;
    if (capacityTotal < 0) {
      return {
        possible: false,
        reason:
          "A Team already holds more Players than the maximum Roster size.",
      };
    }
    const budget = team.budget - team.spent;
    if (budget < 0) {
      return {
        possible: false,
        reason: "A Team has spent more than its Budget.",
      };
    }

    const need: number[] = [];
    const capacity: number[] = [];
    for (let index = 0; index < tierCount; index += 1) {
      const tier = tiers[index]!;
      const assigned = preassignedByTier[index] ?? 0;
      const tierCapacity = tier.maxPerTeam - assigned;
      if (tierCapacity < 0) {
        return {
          possible: false,
          reason: `A Team already holds more Players than the "${tier.label}" Tier maximum.`,
        };
      }
      const required = Math.max(0, tier.minPerTeam - assigned);
      if (required > tierCapacity) {
        return {
          possible: false,
          reason: `A Team cannot reach the "${tier.label}" Tier minimum within that Tier's maximum.`,
        };
      }
      need.push(required);
      capacity.push(tierCapacity);
    }

    const needTotal = Math.max(
      Math.max(0, input.rosterMin - team.preassignedTotal),
      need.reduce((total, count) => total + count, 0),
    );
    if (needTotal > capacityTotal) {
      return {
        possible: false,
        reason:
          "A Team cannot reach its minimum Roster size within the maximum.",
      };
    }

    states.push({
      budget,
      capacity,
      capacityTotal,
      id: team.id,
      need,
      needExtra: needTotal - need.reduce((total, count) => total + count, 0),
      needTotal,
    });
  }

  const requiredInTier = new Array<number>(tierCount).fill(0);
  let totalRequired = 0;
  for (const state of states) {
    totalRequired += state.needTotal;
    for (let index = 0; index < tierCount; index += 1) {
      requiredInTier[index] += state.need[index]!;
    }
  }

  if (totalRequired === 0) {
    return { players: [], requiredInTier, teams: states, tiers, totalRequired };
  }

  const perTier: Prepared["players"][] = Array.from(
    { length: tierCount },
    () => [],
  );
  for (const player of input.players) {
    const tierIndex = tiered ? player.tierIndex : 0;
    if (tierIndex < 0 || tierIndex >= tierCount) continue;
    perTier[tierIndex]!.push({
      id: player.id,
      price: player.startingPrice,
      tierIndex,
    });
  }

  const players: Prepared["players"] = [];
  for (let index = 0; index < tierCount; index += 1) {
    const pool = perTier[index]!.sort(
      (left, right) =>
        left.price - right.price || left.id.localeCompare(right.id),
    );
    if (requiredInTier[index]! > pool.length) {
      return {
        possible: false,
        reason: `Not enough Players remain in the "${tiers[index]!.label}" Tier to fill every Team's minimum.`,
      };
    }
    // At most `totalRequired` Players are ever assigned, so a Tier can never
    // need more than its own minimum plus that whole remainder. Keeping a
    // prefix of the cheapest Players preserves every feasible assignment.
    const limit = Math.min(
      pool.length,
      requiredInTier[index]! + Math.min(totalRequired, pool.length),
    );
    for (let offset = 0; offset < limit; offset += 1) {
      players.push(pool[offset]!);
    }
  }

  if (totalRequired > players.length) {
    return {
      possible: false,
      reason: `Not enough Players remain to fill every Team's minimum Roster size: ${totalRequired} more needed, ${players.length} available.`,
    };
  }

  for (const state of states) {
    if (state.needTotal === 0) continue;
    let lowerBound = 0;
    for (let index = 0; index < tierCount; index += 1) {
      const needed = state.need[index]!;
      const prices = perTier[index]!;
      for (let offset = 0; offset < needed; offset += 1) {
        lowerBound += prices[offset]?.price ?? 0;
      }
    }
    if (lowerBound > state.budget) {
      return {
        possible: false,
        reason: `A Team cannot afford the cheapest Players it still needs: at least ${lowerBound} Credits are required for its remaining Tier minimums, but only ${state.budget} Credit${state.budget === 1 ? "" : "s"} remain in its Budget.`,
      };
    }
  }

  return { players, requiredInTier, teams: states, tiers, totalRequired };
}

function teamComplete(team: TeamState): boolean {
  if (team.needTotal !== 0) return false;
  return team.need.every((count) => count === 0);
}

function allComplete(teams: readonly TeamState[]): boolean {
  return teams.every(teamComplete);
}

interface SearchOutcome {
  assignments: MatchingAssignment[][];
  exhausted: boolean;
}

/**
 * The exact search. It walks the candidate Players in a fixed order and, for
 * every one, either skips it or gives it to a Team that still needs its Tier.
 * It records each complete assignment it reaches, up to a small cap, so the
 * caller has a real choice among feasible assignments.
 */
function searchExactly(prepared: Prepared, nodeBudget: number): SearchOutcome {
  const teams = prepared.teams.map((team) => ({
    ...team,
    capacity: [...team.capacity],
    need: [...team.need],
  }));
  const items = [...prepared.players].sort(
    (left, right) =>
      left.price - right.price || left.id.localeCompare(right.id),
  );
  const assignments: MatchingAssignment[][] = [];
  const current: MatchingAssignment[] = [];
  let nodes = 0;
  let exhausted = false;

  const remainingNeed = (): number =>
    teams.reduce((total, team) => total + team.needTotal, 0);

  const assign = (index: number): void => {
    if (assignments.length >= MATCHING_MAX_ASSIGNMENTS || exhausted) return;
    if (allComplete(teams)) {
      assignments.push([...current]);
      return;
    }
    if (index >= items.length) return;
    if (remainingNeed() > items.length - index) return;

    nodes += 1;
    if (nodes > nodeBudget) {
      exhausted = true;
      return;
    }

    const item = items[index]!;
    const seen = new Set<string>();
    for (const team of teams) {
      // A Player satisfies a Tier minimum when that Tier still needs one, and
      // otherwise fills one of the Team's remaining total Roster slots.
      const fillsTier = team.need[item.tierIndex]! > 0;
      if (!fillsTier && team.needExtra <= 0) continue;
      if (team.capacity[item.tierIndex]! <= 0) continue;
      if (item.price > team.budget) continue;

      // Teams in identical states are interchangeable.
      const key = `${team.needTotal}:${team.needExtra}:${team.budget}:${team.need.join(",")}:${team.capacity.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (fillsTier) team.need[item.tierIndex]! -= 1;
      else team.needExtra -= 1;
      team.needTotal -= 1;
      team.capacity[item.tierIndex] = team.capacity[item.tierIndex]! - 1;
      team.capacityTotal -= 1;
      team.budget -= item.price;
      current.push({ playerId: item.id, teamId: team.id });
      assign(index + 1);
      current.pop();
      if (fillsTier) team.need[item.tierIndex]! += 1;
      else team.needExtra += 1;
      team.needTotal += 1;
      team.capacity[item.tierIndex] = team.capacity[item.tierIndex]! + 1;
      team.capacityTotal += 1;
      team.budget += item.price;
      if (exhausted || assignments.length >= MATCHING_MAX_ASSIGNMENTS) return;
    }

    assign(index + 1);
  };

  assign(0);
  return { assignments, exhausted };
}

/**
 * One verified complete assignment. It shuffles the Players and the Teams and
 * rotates them by the attempt number, then fills each Team's Tier minimums and
 * remaining total need from the cheapest Player that still fits. It returns an
 * assignment only when every Team ends complete, so a reported result is real.
 *
 * The rotation makes the attempts explore different pairings even when the
 * supplied randomness is fixed, which is what gives the caller a real choice
 * among feasible assignments.
 */
function constructOnce(
  prepared: Prepared,
  attempt: number,
  random: () => number,
): MatchingAssignment[] | null {
  const available = rotate(shuffle(prepared.players, random), attempt);
  const teams = rotate(
    shuffle(
      prepared.teams.map((team) => ({
        budget: team.budget,
        capacity: [...team.capacity],
        capacityTotal: team.capacityTotal,
        id: team.id,
        need: [...team.need],
        needExtra: team.needExtra,
        needTotal: team.needTotal,
      })),
      random,
    ),
    attempt,
  );
  const used = new Set<number>();
  const result: MatchingAssignment[] = [];

  for (const team of teams) {
    for (let tierIndex = 0; tierIndex < team.need.length; tierIndex += 1) {
      for (let index = 0; index < available.length; index += 1) {
        if (team.need[tierIndex]! <= 0) break;
        const player = available[index]!;
        if (used.has(index) || player.tierIndex !== tierIndex) continue;
        if (team.capacity[tierIndex]! <= 0) break;
        if (player.price > team.budget) continue;
        used.add(index);
        team.need[tierIndex] -= 1;
        team.needTotal -= 1;
        team.capacity[tierIndex] -= 1;
        team.capacityTotal -= 1;
        team.budget -= player.price;
        result.push({ playerId: player.id, teamId: team.id });
      }
      if (team.need[tierIndex]! > 0) return null;
    }

    for (let index = 0; index < available.length; index += 1) {
      if (team.needTotal <= 0) break;
      if (team.capacityTotal <= 0) break;
      const player = available[index]!;
      if (used.has(index)) continue;
      if (team.capacity[player.tierIndex]! <= 0) continue;
      if (player.price > team.budget) continue;
      used.add(index);
      team.capacity[player.tierIndex] -= 1;
      team.capacityTotal -= 1;
      team.needTotal -= 1;
      team.budget -= player.price;
      result.push({ playerId: player.id, teamId: team.id });
    }
    if (team.needTotal > 0) return null;
  }

  return result;
}

function rotate<T>(items: readonly T[], by: number): T[] {
  if (items.length < 2) return [...items];
  const offset = by % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.min(
      index,
      Math.max(0, Math.floor(random() * (index + 1))),
    );
    const value = copy[index]!;
    copy[index] = copy[swap]!;
    copy[swap] = value;
  }
  return copy;
}

function canonical(assignments: readonly MatchingAssignment[]): string {
  return [...assignments]
    .map((entry) => `${entry.teamId}:${entry.playerId}`)
    .sort()
    .join("|");
}

function pick(
  assignments: readonly MatchingAssignment[][],
  random: () => number,
): MatchingAssignment[] {
  const index = Math.min(
    assignments.length - 1,
    Math.max(0, Math.floor(random() * assignments.length)),
  );
  return assignments[index]!;
}

/**
 * Resolves the Unsold Pool minimums. Returns the complete assignment to make,
 * or a reason why no complete assignment exists.
 *
 * The exact search decides feasibility. Once a completion is known to exist,
 * several verified constructions are collected — random shuffles plus balanced
 * rotations, so the set does not depend on the randomness alone — and secure
 * randomness picks the one to apply.
 */
export function matchUnsoldPlayers(input: MatchingInput): MatchingResult {
  const prepared = prepare(input);
  if (!isPrepared(prepared)) return prepared;
  if (prepared.totalRequired === 0) {
    return { assignments: [], possible: true };
  }

  const random = input.random ?? Math.random;
  const exact = searchExactly(prepared, MATCHING_NODE_BUDGET);
  if (exact.assignments.length === 0 && !exact.exhausted) {
    return { possible: false, reason: UNFEASIBLE_REASON };
  }

  const seen = new Set<string>();
  const feasible: MatchingAssignment[][] = [];
  for (let attempt = 0; attempt < MATCHING_RANDOM_ATTEMPTS; attempt += 1) {
    const constructed = constructOnce(prepared, attempt, random);
    if (!constructed) continue;
    const key = canonical(constructed);
    if (seen.has(key)) continue;
    seen.add(key);
    feasible.push(constructed);
    if (feasible.length >= MATCHING_MAX_ASSIGNMENTS) break;
  }
  if (feasible.length > 0) {
    return { assignments: pick(feasible, random), possible: true };
  }
  if (exact.assignments.length > 0) {
    return { assignments: pick(exact.assignments, random), possible: true };
  }

  return { possible: false, reason: UNFEASIBLE_REASON };
}

/** One Team's current Roster state, as far as minimums are concerned. */
export interface TeamMinimumState {
  id: string;
  rosterCount: number;
  /** The Team's Player count per Tier, indexed like `tiers`. */
  tierCounts: readonly number[];
}

/**
 * The Teams that still miss a required minimum: either the total Roster
 * minimum or any Tier minimum. Both the matching request and Auction
 * completion use this, so they cannot disagree about who is deficient.
 */
export function deficientTeamIds({
  rosterMin,
  teams,
  tiers,
}: {
  rosterMin: number;
  teams: readonly TeamMinimumState[];
  tiers: readonly { minPerTeam: number }[];
}): string[] {
  return teams
    .filter(
      (team) =>
        team.rosterCount < rosterMin ||
        tiers.some(
          (tier, index) => (team.tierCounts[index] ?? 0) < tier.minPerTeam,
        ),
    )
    .map((team) => team.id);
}
