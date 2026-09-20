import { describe, expect, it } from "vitest";

import {
  evaluateLegalCompletion,
  type CompletionPlayer,
  type CompletionTeam,
} from "@/domain/legal-completion";

function players(...prices: number[]): CompletionPlayer[] {
  return prices.map((startingPrice) => ({ startingPrice }));
}

function team(overrides: Partial<CompletionTeam> = {}): CompletionTeam {
  return { budget: 100, preassignedCount: 0, spent: 0, ...overrides };
}

describe("evaluateLegalCompletion", () => {
  it("accepts a pool that can fill every Team's minimum", () => {
    const result = evaluateLegalCompletion({
      players: players(10, 10, 10, 10, 10, 10, 10, 10, 10),
      rosterMax: 4,
      rosterMin: 2,
      teams: [team(), team(), team()],
    });

    expect(result).toEqual({ possible: true, reason: null });
  });

  it("rejects a pool too small to reach every minimum", () => {
    const result = evaluateLegalCompletion({
      players: players(10, 10, 10, 10, 10),
      rosterMax: 4,
      rosterMin: 2,
      teams: [team(), team(), team()],
    });

    expect(result.possible).toBe(false);
    expect(result.reason).toContain("Not enough Players");
  });

  it("rejects a Team that cannot afford its remaining minimum", () => {
    const result = evaluateLegalCompletion({
      players: players(10, 10, 10, 10),
      rosterMax: 4,
      rosterMin: 2,
      teams: [team({ budget: 15 }), team({ budget: 100 })],
    });

    expect(result.possible).toBe(false);
    expect(result.reason).toContain("afford");
  });

  it("gives the cheapest Players to the most Budget-constrained Team", () => {
    const result = evaluateLegalCompletion({
      players: players(1, 9),
      rosterMax: 3,
      rosterMin: 1,
      teams: [team({ budget: 2 }), team({ budget: 100 })],
    });

    expect(result).toEqual({ possible: true, reason: null });
  });

  it("counts preassigned Players toward the minimum", () => {
    const result = evaluateLegalCompletion({
      players: players(50, 50),
      rosterMax: 2,
      rosterMin: 2,
      teams: [team({ preassignedCount: 1 }), team({ preassignedCount: 1 })],
    });

    expect(result).toEqual({ possible: true, reason: null });
  });

  it("rejects a Team that already exceeds the maximum Roster size", () => {
    const result = evaluateLegalCompletion({
      players: players(5),
      rosterMax: 2,
      rosterMin: 1,
      teams: [team({ preassignedCount: 3 })],
    });

    expect(result.possible).toBe(false);
    expect(result.reason).toContain("maximum Roster size");
  });

  it("rejects a Team that has spent beyond its Budget", () => {
    const result = evaluateLegalCompletion({
      players: players(5),
      rosterMax: 2,
      rosterMin: 1,
      teams: [team({ budget: 10, spent: 11 })],
    });

    expect(result.possible).toBe(false);
    expect(result.reason).toContain("spent more than its Budget");
  });
});

/** An independent ground truth for interchangeable Players. */
function bruteForcePossible({
  players: pool,
  rosterMax,
  rosterMin,
  teams,
}: Parameters<typeof evaluateLegalCompletion>[0]): boolean {
  const prices = pool
    .map((player) => player.startingPrice)
    .sort((left, right) => left - right);
  const budgets = teams.map((entry) => entry.budget - entry.spent);
  if (budgets.some((budget) => budget < 0)) return false;

  const required = teams.map((entry) => {
    if (rosterMax - entry.preassignedCount < 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, rosterMin - entry.preassignedCount);
  });
  if (required.some((value) => value === Number.POSITIVE_INFINITY))
    return false;

  const remaining = [...required];
  const cost = teams.map(() => 0);

  const assign = (index: number): boolean => {
    if (remaining.every((value) => value === 0)) return true;
    if (index >= prices.length) return false;

    for (let slot = 0; slot < remaining.length; slot += 1) {
      if (remaining[slot] === 0) continue;
      if (cost[slot]! + prices[index]! > budgets[slot]!) continue;
      remaining[slot] -= 1;
      cost[slot] += prices[index]!;
      if (assign(index + 1)) return true;
      remaining[slot] += 1;
      cost[slot] -= prices[index]!;
    }

    return assign(index + 1);
  };

  return assign(0);
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

describe("evaluateLegalCompletion property cases", () => {
  it("agrees with a brute-force search across many small cases", () => {
    const random = seededRandom(20260921);
    for (let iteration = 0; iteration < 500; iteration += 1) {
      const teamCount = 1 + Math.floor(random() * 3);
      const playerCount = Math.floor(random() * 7);
      const rosterMin = 1 + Math.floor(random() * 3);
      const rosterMax = rosterMin + Math.floor(random() * 3);
      const input = {
        players: players(
          ...Array.from(
            { length: playerCount },
            () => 1 + Math.floor(random() * 20),
          ),
        ),
        rosterMax,
        rosterMin,
        teams: Array.from({ length: teamCount }, () =>
          team({
            budget: 1 + Math.floor(random() * 40),
            preassignedCount: Math.floor(random() * 3),
          }),
        ),
      };

      expect(
        evaluateLegalCompletion(input).possible,
        `case ${JSON.stringify(input)}`,
      ).toBe(bruteForcePossible(input));
    }
  });
});
