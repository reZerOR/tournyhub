/**
 * Tiered Legal Completion: whether every Team can still finish with a legal
 * Roster under Tiered Rules.
 *
 * This is the Tiered counterpart of `legal-completion.ts`. It answers the same
 * question as one allocation problem across all Teams and Tiers at once:
 * given the Players still available per Tier and every Team's remaining Tier
 * minimums, Tier maximums, total Roster range, and Budget, can each Team reach
 * its minimums without exceeding any maximum or Budget?
 *
 * The engine is deterministic and pure. It:
 *
 * 1. Rejects a snapshot that fails a necessary condition (capacity, overspend,
 *    or too few Players in a Tier).
 * 2. Searches exactly for a witness allocation over the cheapest Players per
 *    Tier, under a fixed node budget. Small Auctions are decided exactly.
 * 3. Falls back to a deterministic heuristic when the exact search runs out of
 *    its node budget. The heuristic only ever reports a completion it actually
 *    constructs, so the engine never claims a Legal Completion that does not
 *    exist.
 *
 * Every returned `possible: true` is backed by a constructed allocation, so the
 * result is safe to gate Readiness and live Bids on.
 */
export interface TieredCompletionPlayer {
  startingPrice: number;
  /** The index of this Player's Tier in `TieredCompletionInput.tiers`. */
  tierIndex: number;
}

export interface TieredCompletionTeam {
  /** Credits available to this Team before `spent`. */
  budget: number;
  /** Players already on this Team's Roster per Tier, such as Player Representatives. */
  preassignedByTier: readonly number[];
  /** Credits already committed by this Team. */
  spent: number;
}

export interface TieredCompletionTier {
  /** A short label used only in a human-readable blocking reason. */
  label: string;
  maxPerTeam: number;
  minPerTeam: number;
}

export interface TieredCompletionInput {
  players: readonly TieredCompletionPlayer[];
  rosterMax: number;
  rosterMin: number;
  teams: readonly TieredCompletionTeam[];
  tiers: readonly TieredCompletionTier[];
}

export interface TieredCompletionResult {
  possible: boolean;
  reason: null | string;
}

/** How many allocation nodes the exact search may visit before falling back. */
export const TIERED_COMPLETION_NODE_BUDGET = 200_000;

interface TeamState {
  budget: number;
  cost: number;
  /** Remaining count already assigned per Tier, for capacity and need checks. */
  assignedTier: number[];
  assignedTotal: number;
  requiredTier: number[];
  requiredTotal: number;
  tierCapacity: number[];
}

interface Candidate {
  price: number;
  tierIndex: number;
}

interface Prepared {
  candidates: Candidate[];
  teams: TeamState[];
}

function isPrepared(
  value: Prepared | TieredCompletionResult,
): value is Prepared {
  return "candidates" in value;
}

function prepare(
  input: TieredCompletionInput,
): Prepared | TieredCompletionResult {
  const { players, rosterMax, rosterMin, teams, tiers } = input;
  const tierCount = tiers.length;

  const states: TeamState[] = [];
  for (const team of teams) {
    const preassignedTotal = team.preassignedByTier.reduce(
      (total, count) => total + count,
      0,
    );
    const totalCapacity = rosterMax - preassignedTotal;
    if (totalCapacity < 0) {
      return {
        possible: false,
        reason:
          "A Team already holds more Players than the maximum Roster size.",
      };
    }
    const remainingBudget = team.budget - team.spent;
    if (remainingBudget < 0) {
      return {
        possible: false,
        reason: "A Team has spent more than its Budget.",
      };
    }

    const requiredTier: number[] = [];
    const tierCapacity: number[] = [];
    for (let tierIndex = 0; tierIndex < tierCount; tierIndex += 1) {
      const preassigned = team.preassignedByTier[tierIndex] ?? 0;
      const tier = tiers[tierIndex]!;
      const capacity = tier.maxPerTeam - preassigned;
      if (capacity < 0) {
        return {
          possible: false,
          reason: `A Team already holds more Players than the "${tier.label}" Tier maximum.`,
        };
      }
      const required = Math.max(0, tier.minPerTeam - preassigned);
      if (required > capacity) {
        return {
          possible: false,
          reason: `A Team cannot reach the "${tier.label}" Tier minimum within that Tier's maximum.`,
        };
      }
      requiredTier.push(required);
      tierCapacity.push(capacity);
    }

    const requiredTotal = Math.max(
      Math.max(0, rosterMin - preassignedTotal),
      requiredTier.reduce((total, count) => total + count, 0),
    );
    if (requiredTotal > totalCapacity) {
      return {
        possible: false,
        reason:
          "A Team cannot reach its minimum Roster size within the maximum.",
      };
    }

    states.push({
      assignedTier: new Array<number>(tierCount).fill(0),
      assignedTotal: 0,
      budget: remainingBudget,
      cost: 0,
      requiredTier,
      requiredTotal,
      tierCapacity,
    });
  }

  const requiredFromTier = new Array<number>(tierCount).fill(0);
  let totalRequired = 0;
  for (const state of states) {
    totalRequired += state.requiredTotal;
    for (let tierIndex = 0; tierIndex < tierCount; tierIndex += 1) {
      requiredFromTier[tierIndex] += state.requiredTier[tierIndex]!;
    }
  }

  const perTier: number[][] = Array.from({ length: tierCount }, () => []);
  for (const player of players) {
    if (player.tierIndex < 0 || player.tierIndex >= tierCount) continue;
    perTier[player.tierIndex]!.push(player.startingPrice);
  }

  // The most Players that can ever be assigned is every Team's remaining
  // minimum. Any feasible allocation can be rewritten to use the cheapest
  // Players of each Tier, so a prefix of that length per Tier is sufficient.
  const candidates: Candidate[] = [];
  for (let tierIndex = 0; tierIndex < tierCount; tierIndex += 1) {
    const prices = perTier[tierIndex]!.sort((left, right) => left - right);
    if (requiredFromTier[tierIndex]! > prices.length) {
      return {
        possible: false,
        reason: `Not enough Players remain in the "${tiers[tierIndex]!.label}" Tier to fill every Team's minimum.`,
      };
    }
    const limit = Math.min(prices.length, totalRequired);
    for (let index = 0; index < limit; index += 1) {
      candidates.push({ price: prices[index]!, tierIndex });
    }
  }

  // A Team can never pay less than the cheapest Players it still needs to meet
  // its Tier minimums, so a Budget below that lower bound is impossible however
  // the Players are shared. Reporting the shortfall makes a vague "no Legal
  // Completion" actionable.
  for (const state of states) {
    if (state.requiredTotal === 0) continue;
    let lowerBound = 0;
    for (let tierIndex = 0; tierIndex < tierCount; tierIndex += 1) {
      const needed = state.requiredTier[tierIndex]!;
      const prices = perTier[tierIndex]!;
      for (let index = 0; index < needed; index += 1) {
        lowerBound += prices[index] ?? 0;
      }
    }
    if (lowerBound > state.budget) {
      return {
        possible: false,
        reason: `A Team cannot afford the cheapest Players it still needs: at least ${lowerBound} Credits are required for its remaining Tier minimums, but only ${state.budget} Credit${state.budget === 1 ? "" : "s"} remain in its Budget. Raise the Budget or lower the Tier Starting Prices.`,
      };
    }
  }

  return { candidates, teams: states };
}

function teamComplete(team: TeamState): boolean {
  if (team.assignedTotal !== team.requiredTotal) return false;
  for (
    let tierIndex = 0;
    tierIndex < team.requiredTier.length;
    tierIndex += 1
  ) {
    if (team.assignedTier[tierIndex]! < team.requiredTier[tierIndex]!) {
      return false;
    }
  }
  return true;
}

function allComplete(teams: TeamState[]): boolean {
  return teams.every(teamComplete);
}

/**
 * A complete search for a witness allocation. Returns true when one is found,
 * false when none exists, and null when the node budget is exhausted before the
 * search finishes.
 */
function searchExactly(prepared: Prepared, nodeBudget: number): boolean | null {
  const items = [...prepared.candidates].sort(
    (left, right) => right.price - left.price,
  );
  const teams = prepared.teams.map((team) => ({
    ...team,
    assignedTier: [...team.assignedTier],
  }));

  let visited = 0;
  let exhausted = false;

  const assign = (index: number): boolean => {
    if (allComplete(teams)) return true;
    if (index === items.length) return false;

    visited += 1;
    if (visited > nodeBudget) {
      exhausted = true;
      return false;
    }

    const item = items[index]!;
    const seen = new Set<string>();
    for (const team of teams) {
      if (team.assignedTotal >= team.requiredTotal) continue;
      if (
        team.assignedTier[item.tierIndex]! >= team.tierCapacity[item.tierIndex]!
      )
        continue;
      if (team.cost + item.price > team.budget) continue;

      // Teams in identical states are interchangeable.
      const key = `${team.assignedTotal}:${team.cost}:${team.budget}:${team.assignedTier.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);

      team.assignedTier[item.tierIndex] =
        team.assignedTier[item.tierIndex]! + 1;
      team.assignedTotal += 1;
      team.cost += item.price;
      if (assign(index + 1)) return true;
      team.assignedTier[item.tierIndex] =
        team.assignedTier[item.tierIndex]! - 1;
      team.assignedTotal -= 1;
      team.cost -= item.price;
      if (exhausted) return false;
    }

    // Leaving the Player unassigned is only useful while some Team still needs
    // a Player, which `allComplete` already checked above.
    return assign(index + 1);
  };

  if (assign(0)) return true;
  return exhausted ? null : false;
}

/**
 * Fills each Team's Tier needs with the cheapest affordable Players, then its
 * remaining total need. Reports a completion only when it actually constructs
 * one.
 */
function greedyHeuristic(prepared: Prepared, tightestFirst: boolean): boolean {
  const teams = prepared.teams.map((team) => ({
    ...team,
    assignedTier: [...team.assignedTier],
  }));
  const items = [...prepared.candidates].sort(
    (left, right) => right.price - left.price,
  );
  const used = new Array<boolean>(items.length).fill(false);

  const order = teams
    .map((_, index) => index)
    .sort((left, right) =>
      tightestFirst
        ? teams[left]!.budget - teams[right]!.budget
        : teams[right]!.budget - teams[left]!.budget,
    );

  // First pass: satisfy Tier minimums.
  for (const teamIndex of order) {
    const team = teams[teamIndex]!;
    for (
      let tierIndex = 0;
      tierIndex < team.requiredTier.length;
      tierIndex += 1
    ) {
      for (
        let index = 0;
        index < items.length &&
        team.assignedTier[tierIndex]! < team.requiredTier[tierIndex]!;
        index += 1
      ) {
        const item = items[index]!;
        if (used[index] || item.tierIndex !== tierIndex) continue;
        if (team.assignedTier[tierIndex]! >= team.tierCapacity[tierIndex]!)
          break;
        if (team.cost + item.price > team.budget) continue;
        used[index] = true;
        team.assignedTier[tierIndex] = team.assignedTier[tierIndex]! + 1;
        team.assignedTotal += 1;
        team.cost += item.price;
      }
      if (team.assignedTier[tierIndex]! < team.requiredTier[tierIndex]!) {
        return false;
      }
    }
  }

  // Second pass: satisfy the remaining total Roster minimum.
  for (const teamIndex of order) {
    const team = teams[teamIndex]!;
    for (let index = 0; index < items.length; index += 1) {
      if (team.assignedTotal >= team.requiredTotal) break;
      const item = items[index]!;
      if (used[index]) continue;
      if (
        team.assignedTier[item.tierIndex]! >= team.tierCapacity[item.tierIndex]!
      )
        continue;
      if (team.cost + item.price > team.budget) continue;
      used[index] = true;
      team.assignedTier[item.tierIndex] =
        team.assignedTier[item.tierIndex]! + 1;
      team.assignedTotal += 1;
      team.cost += item.price;
    }
    if (team.assignedTotal < team.requiredTotal) return false;
  }

  return allComplete(teams);
}

export function evaluateTieredCompletion(
  input: TieredCompletionInput,
): TieredCompletionResult {
  const prepared = prepare(input);
  if (!isPrepared(prepared)) return prepared;

  const exact = searchExactly(prepared, TIERED_COMPLETION_NODE_BUDGET);
  if (exact === true) return { possible: true, reason: null };
  if (exact === false) {
    return {
      possible: false,
      reason:
        "A Team cannot afford the cheapest Players it still needs within its Budget.",
    };
  }

  if (greedyHeuristic(prepared, true) || greedyHeuristic(prepared, false)) {
    return { possible: true, reason: null };
  }

  return {
    possible: false,
    reason:
      "A Team cannot afford the cheapest Players it still needs within its Budget.",
  };
}
