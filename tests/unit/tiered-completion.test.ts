import { describe, expect, it } from "vitest";

import {
  evaluateTieredCompletion,
  type TieredCompletionInput,
} from "@/domain/tiered-completion";

function tier(minPerTeam: number, maxPerTeam: number, label = "T") {
  return { label, maxPerTeam, minPerTeam };
}

function team(
  preassignedByTier: number[],
  overrides: Partial<{ budget: number; spent: number }> = {},
) {
  return { budget: 100, preassignedByTier, spent: 0, ...overrides };
}

function player(startingPrice: number, tierIndex: number) {
  return { startingPrice, tierIndex };
}

describe("evaluateTieredCompletion", () => {
  it("accepts a pool that fills every Team's Tier minimums", () => {
    const result = evaluateTieredCompletion({
      players: [
        player(10, 0),
        player(10, 0),
        player(10, 0),
        player(10, 0),
        player(20, 1),
        player(20, 1),
      ],
      rosterMax: 4,
      rosterMin: 3,
      teams: [team([0, 0]), team([0, 0])],
      tiers: [tier(1, 2, "Bronze"), tier(1, 1, "Gold")],
    });

    expect(result).toEqual({ possible: true, reason: null });
  });

  it("reports a Tier with too few Players for every minimum", () => {
    const result = evaluateTieredCompletion({
      players: [player(10, 0), player(10, 0), player(20, 1)],
      rosterMax: 3,
      rosterMin: 2,
      teams: [team([0, 0]), team([0, 0])],
      tiers: [tier(1, 2, "Bronze"), tier(1, 1, "Gold")],
    });

    expect(result.possible).toBe(false);
    expect(result.reason).toContain("Gold");
  });

  it("rejects a Team that already exceeds a Tier maximum", () => {
    const result = evaluateTieredCompletion({
      players: [player(10, 0)],
      rosterMax: 3,
      rosterMin: 1,
      teams: [team([2]), team([0])],
      tiers: [tier(0, 1, "Bronze")],
    });

    expect(result.possible).toBe(false);
    expect(result.reason).toContain("Bronze");
  });

  it("accounts for a Player Representative filling a Tier minimum", () => {
    const result = evaluateTieredCompletion({
      players: [player(10, 0), player(10, 0), player(20, 1)],
      rosterMax: 3,
      rosterMin: 2,
      teams: [team([0, 1]), team([0, 1])],
      tiers: [tier(1, 2, "Bronze"), tier(1, 1, "Gold")],
    });

    expect(result).toEqual({ possible: true, reason: null });
  });

  it("rejects a Tier minimum a Team cannot afford within Budget", () => {
    const result = evaluateTieredCompletion({
      players: [player(100, 1), player(100, 1)],
      rosterMax: 3,
      rosterMin: 1,
      teams: [team([0, 0], { budget: 50 }), team([0, 0], { budget: 50 })],
      tiers: [tier(1, 1, "Gold")],
    });

    expect(result.possible).toBe(false);
  });

  it("spreads expensive Tiers to the Team that can afford them", () => {
    const result = evaluateTieredCompletion({
      players: [player(90, 0), player(10, 0)],
      rosterMax: 3,
      rosterMin: 1,
      teams: [team([0], { budget: 20 }), team([0], { budget: 100 })],
      tiers: [tier(1, 1, "Bronze")],
    });

    expect(result).toEqual({ possible: true, reason: null });
  });
});

/** An independent ground truth that allows any count within each Tier range. */
function bruteForcePossible(input: TieredCompletionInput): boolean {
  const { players, rosterMax, rosterMin, teams, tiers } = input;
  const assigned = teams.map(() => new Array<number>(tiers.length).fill(0));
  const cost = teams.map(() => 0);

  const valid = () => {
    for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
      const remainingBudget =
        teams[teamIndex]!.budget - teams[teamIndex]!.spent;
      if (cost[teamIndex]! > remainingBudget) return false;
      let total = 0;
      for (let tierIndex = 0; tierIndex < tiers.length; tierIndex += 1) {
        const count =
          (teams[teamIndex]!.preassignedByTier[tierIndex] ?? 0) +
          assigned[teamIndex]![tierIndex]!;
        total += count;
        if (count < tiers[tierIndex]!.minPerTeam) return false;
        if (count > tiers[tierIndex]!.maxPerTeam) return false;
      }
      if (total < rosterMin) return false;
      if (total > rosterMax) return false;
    }
    return true;
  };

  const search = (index: number): boolean => {
    if (index === players.length) return valid();
    const price = players[index]!.startingPrice;
    const tierIndex = players[index]!.tierIndex;
    for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
      assigned[teamIndex]![tierIndex]! += 1;
      cost[teamIndex]! += price;
      const ok = search(index + 1);
      assigned[teamIndex]![tierIndex]! -= 1;
      cost[teamIndex]! -= price;
      if (ok) return true;
    }
    return search(index + 1);
  };

  return search(0);
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

describe("evaluateTieredCompletion property cases", () => {
  it("agrees with a brute-force search across many small cases", () => {
    const random = seededRandom(20260922);
    for (let iteration = 0; iteration < 400; iteration += 1) {
      const tierCount = 1 + Math.floor(random() * 2);
      const teamCount = 1 + Math.floor(random() * 2);
      const playerCount = Math.floor(random() * 5);
      const tiers = Array.from({ length: tierCount }, () => {
        const minPerTeam = Math.floor(random() * 2);
        const maxPerTeam = minPerTeam + Math.floor(random() * 2) + 1;
        return tier(minPerTeam, maxPerTeam, `T${minPerTeam}-${maxPerTeam}`);
      });
      const rosterMin = 1 + Math.floor(random() * 3);
      const rosterMax = rosterMin + Math.floor(random() * 2);
      const input: TieredCompletionInput = {
        players: Array.from({ length: playerCount }, () =>
          player(
            1 + Math.floor(random() * 20),
            Math.floor(random() * tierCount),
          ),
        ),
        rosterMax,
        rosterMin,
        teams: Array.from({ length: teamCount }, () =>
          team(
            Array.from({ length: tierCount }, () => Math.floor(random() * 2)),
            { budget: 1 + Math.floor(random() * 40) },
          ),
        ),
        tiers,
      };

      expect(
        evaluateTieredCompletion(input).possible,
        `case ${JSON.stringify(input)}`,
      ).toBe(bruteForcePossible(input));
    }
  });
});
