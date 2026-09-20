/**
 * Legal Completion: whether every Team can still finish with a legal Roster.
 *
 * The engine is deterministic and pure. It answers the question Readiness and
 * live Bids both need: given the Players still available and every Team's
 * remaining minimum, maximum, and Budget, can each Team still reach its
 * minimum without exceeding capacity or Budget?
 *
 * Deciding this exactly is an instance of multiway number partitioning, which
 * is NP-hard (three-partition), so there is no fast exact algorithm. The
 * engine instead:
 *
 * 1. Rejects a snapshot that fails a necessary condition (capacity, overspend,
 *    or too few Players).
 * 2. Searches exactly for a witness allocation over the cheapest Players,
 *    under a fixed node budget. Small Auctions are therefore decided exactly.
 * 3. Falls back to two deterministic heuristics when the exact search runs out
 *    of its node budget. Both heuristics only ever report a completion they
 *    actually construct, so the engine never claims a Legal Completion that
 *    does not exist.
 *
 * Because every returned `possible: true` is backed by a constructed
 * allocation, the result is safe to gate Readiness and live Bids on. The only
 * cost of the node budget is that an unusually tight, large Auction can be
 * reported impossible when a completion exists — the Organizer fixes that by
 * raising Budgets or lowering Starting Prices.
 */
export interface CompletionTeam {
  /** Credits available to this Team (its full Budget minus spendable reserve). */
  budget: number;
  /** Players already on this Team's Roster, such as Player Representatives. */
  preassignedCount: number;
  /** Credits already committed by this Team (0 during setup). */
  spent: number;
}

export interface CompletionPlayer {
  startingPrice: number;
}

export interface LegalCompletionInput {
  /** Players still available to be acquired (preassigned Players excluded). */
  players: readonly CompletionPlayer[];
  rosterMax: number;
  rosterMin: number;
  teams: readonly CompletionTeam[];
}

export interface LegalCompletionResult {
  possible: boolean;
  /** A short sentence naming the blocking constraint, or null when possible. */
  reason: null | string;
}

/** How many allocation nodes the exact search may visit before falling back. */
export const LEGAL_COMPLETION_NODE_BUDGET = 200_000;

interface TeamDemand {
  budget: number;
  cost: number;
  demand: number;
}

interface Prepared {
  required: number;
  teams: TeamDemand[];
  chosen: number[];
}

/**
 * The cheapest Players that can fill every remaining minimum. Any feasible
 * allocation can be rewritten to use this set: swapping a used Player for a
 * cheaper unused one never increases a Team's cost.
 */
function prepare(
  input: LegalCompletionInput,
): LegalCompletionResult | Prepared {
  const { players, rosterMax, rosterMin, teams } = input;

  const demands: TeamDemand[] = [];
  let requiredTotal = 0;
  for (const team of teams) {
    const capacity = rosterMax - team.preassignedCount;
    if (capacity < 0) {
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
    const required = Math.max(0, rosterMin - team.preassignedCount);
    if (required > capacity) {
      return {
        possible: false,
        reason:
          "A Team cannot reach its minimum Roster size within the maximum.",
      };
    }
    requiredTotal += required;
    demands.push({ budget: remainingBudget, cost: 0, demand: required });
  }

  if (requiredTotal > players.length) {
    return {
      possible: false,
      reason: `Not enough Players remain to fill every Team's minimum Roster size: ${requiredTotal} more needed, ${players.length} available.`,
    };
  }

  const chosen = players
    .map((player) => player.startingPrice)
    .sort((left, right) => left - right)
    .slice(0, requiredTotal);

  // A Team can never pay less than the cheapest Players it still needs, so a
  // Budget below that lower bound is impossible however the Players are shared.
  // Reporting the shortfall here turns a vague "no Legal Completion" into a
  // number the Organizer can act on.
  for (const demand of demands) {
    if (demand.demand === 0) continue;
    const lowerBound = chosen
      .slice(0, demand.demand)
      .reduce((total, price) => total + price, 0);
    if (lowerBound > demand.budget) {
      return {
        possible: false,
        reason: `A Team cannot afford the cheapest Players it still needs: at least ${lowerBound} Credits are required for its remaining ${demand.demand} Player${demand.demand === 1 ? "" : "s"}, but only ${demand.budget} Credit${demand.budget === 1 ? "" : "s"} remain in its Budget. Raise the Budget or lower the Starting Prices.`,
      };
    }
  }

  return { chosen, required: requiredTotal, teams: demands };
}

function isPrepared(
  value: LegalCompletionResult | Prepared,
): value is Prepared {
  return "chosen" in value;
}

/**
 * A complete search for a witness allocation. Returns true when one is found,
 * false when none exists, and null when the node budget is exhausted before
 * the search finishes.
 */
function searchExactly(prepared: Prepared, nodeBudget: number): boolean | null {
  const { chosen, teams } = prepared;
  const items = [...chosen].sort((left, right) => right - left);
  const state = teams.map((team) => ({ ...team }));

  let visited = 0;
  let exhausted = false;

  const assign = (index: number): boolean => {
    if (index === items.length) return true;
    visited += 1;
    if (visited > nodeBudget) {
      exhausted = true;
      return false;
    }

    const price = items[index]!;
    const seen = new Set<string>();
    for (const team of state) {
      if (team.demand === 0) continue;
      if (team.cost + price > team.budget) continue;

      // Teams in identical states are interchangeable.
      const key = `${team.demand}:${team.cost}:${team.budget}`;
      if (seen.has(key)) continue;
      seen.add(key);

      team.demand -= 1;
      team.cost += price;
      if (assign(index + 1)) return true;
      team.demand += 1;
      team.cost -= price;
      if (exhausted) return false;
    }

    return false;
  };

  if (assign(0)) return true;
  return exhausted ? null : false;
}

/**
 * Assigns the largest remaining Player to the Team with the lowest current
 * cost that can still afford it, balancing spend across Teams.
 */
function balanceHeuristic(prepared: Prepared): boolean {
  const state = prepared.teams.map((team) => ({ ...team }));
  const items = [...prepared.chosen].sort((left, right) => right - left);

  for (const price of items) {
    const candidates = state.filter(
      (team) => team.demand > 0 && team.cost + price <= team.budget,
    );
    if (candidates.length === 0) return false;

    candidates.sort(
      (left, right) => left.cost - right.cost || right.budget - left.budget,
    );
    const target = candidates[0]!;
    target.cost += price;
    target.demand -= 1;
  }

  return state.every((team) => team.demand === 0);
}

/**
 * Lets the most Budget-constrained Team take the largest Players it can still
 * afford, leaving the cheap Players for the Teams with more spend.
 */
function constrainedFirstHeuristic(prepared: Prepared): boolean {
  const state = prepared.teams.map((team) => ({ ...team }));
  state.sort((left, right) => left.budget - right.budget);
  const items = [...prepared.chosen].sort((left, right) => right - left);
  const used = new Array<boolean>(items.length).fill(false);

  for (const team of state) {
    for (let index = 0; index < items.length && team.demand > 0; index += 1) {
      if (used[index]) continue;
      const price = items[index]!;
      if (team.cost + price <= team.budget) {
        used[index] = true;
        team.cost += price;
        team.demand -= 1;
      }
    }
    if (team.demand > 0) return false;
  }

  return true;
}

export function evaluateLegalCompletion(
  input: LegalCompletionInput,
): LegalCompletionResult {
  const prepared = prepare(input);
  if (!isPrepared(prepared)) return prepared;

  const exact = searchExactly(prepared, LEGAL_COMPLETION_NODE_BUDGET);
  if (exact === true) return { possible: true, reason: null };
  if (exact === false) {
    return {
      possible: false,
      reason:
        "A Team cannot afford the cheapest Players it still needs within its Budget.",
    };
  }

  if (balanceHeuristic(prepared) || constrainedFirstHeuristic(prepared)) {
    return { possible: true, reason: null };
  }

  return {
    possible: false,
    reason:
      "A Team cannot afford the cheapest Players it still needs within its Budget.",
  };
}
