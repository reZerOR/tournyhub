import { describe, expect, it } from "vitest";

import {
  matchUnsoldPlayers,
  type MatchingInput,
  type MatchingTier,
} from "@/domain/matching";

/**
 * An independent brute-force reference. It assigns every Player to a Team or
 * leaves it unsold, then reports whether any arrangement satisfies every Team.
 */
function bruteForcePossible(input: MatchingInput): boolean {
  const tiers: MatchingTier[] =
    input.tiers.length > 0
      ? [...input.tiers]
      : [
          {
            label: "Roster",
            maxPerTeam: input.rosterMax,
            minPerTeam: input.rosterMin,
          },
        ];

  // A Team that already exceeds a maximum cannot be repaired.
  if (input.teams.some((team) => team.preassignedTotal > input.rosterMax)) {
    return false;
  }
  for (const [index, tier] of tiers.entries()) {
    if (
      input.teams.some(
        (team) =>
          (input.tiers.length > 0
            ? (team.preassignedByTier[index] ?? 0)
            : team.preassignedTotal) > tier.maxPerTeam,
      )
    ) {
      return false;
    }
  }

  const state = input.teams.map((team) => ({
    budget: team.budget - team.spent,
    counts: tiers.map((_, index) =>
      input.tiers.length > 0
        ? (team.preassignedByTier[index] ?? 0)
        : team.preassignedTotal,
    ),
    total: team.preassignedTotal,
  }));

  const complete = () =>
    state.every(
      (team) =>
        team.total >= input.rosterMin &&
        tiers.every((tier, index) => team.counts[index]! >= tier.minPerTeam),
    );

  const assign = (index: number): boolean => {
    if (index === input.players.length) return complete();
    if (assign(index + 1)) return true;

    const player = input.players[index]!;
    const tierIndex = input.tiers.length > 0 ? player.tierIndex : 0;
    if (tierIndex < 0 || tierIndex >= tiers.length) return false;

    let found = false;
    for (const team of state) {
      if (team.total >= input.rosterMax) continue;
      if (team.counts[tierIndex]! >= tiers[tierIndex]!.maxPerTeam) continue;
      if (player.startingPrice > team.budget) continue;

      team.total += 1;
      team.counts[tierIndex] += 1;
      team.budget -= player.startingPrice;
      found = assign(index + 1);
      team.total -= 1;
      team.counts[tierIndex] -= 1;
      team.budget += player.startingPrice;
      if (found) return true;
    }
    return false;
  };

  return assign(0);
}

/** A small deterministic generator so a failure is reproducible. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomCase(random: () => number): MatchingInput {
  const tierCount = Math.floor(random() * 3);
  const teamCount = 1 + Math.floor(random() * 3);
  const playerCount = Math.floor(random() * 6);
  const rosterMin = Math.floor(random() * 3);
  const rosterMax = rosterMin + Math.floor(random() * 3);

  const tiers: MatchingTier[] = Array.from(
    { length: tierCount },
    (_, index) => {
      const min = Math.floor(random() * 2);
      return {
        label: `T${index}`,
        maxPerTeam: min + Math.floor(random() * 3),
        minPerTeam: min,
      };
    },
  );

  return {
    players: Array.from({ length: playerCount }, (_, index) => ({
      id: `p${index}`,
      startingPrice: 1 + Math.floor(random() * 5),
      tierIndex: tierCount === 0 ? 0 : Math.floor(random() * tierCount),
    })),
    random: makeRandom(7),
    rosterMax,
    rosterMin,
    teams: Array.from({ length: teamCount }, (_, index) => ({
      budget: 5 + Math.floor(random() * 20),
      id: `t${index}`,
      preassignedByTier: tiers.map(() => Math.floor(random() * 2)),
      preassignedTotal: Math.floor(random() * 2),
      spent: 0,
    })),
    tiers,
  };
}

describe("matchUnsoldPlayers", () => {
  it("agrees with a brute-force search on randomized small Auctions", () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const input = randomCase(makeRandom(seed));
      const result = matchUnsoldPlayers(input);
      const expected = bruteForcePossible(input);

      expect(result.possible, `seed ${seed}`).toBe(expected);

      if (result.possible) {
        // A reported assignment must be complete and legal.
        const byTeam = new Map<string, number>();
        const used = new Set<string>();
        for (const assignment of result.assignments) {
          expect(used.has(assignment.playerId), `seed ${seed}`).toBe(false);
          used.add(assignment.playerId);
          byTeam.set(
            assignment.teamId,
            (byTeam.get(assignment.teamId) ?? 0) + 1,
          );
        }
        for (const team of input.teams) {
          const counts = input.tiers.map((_, index) =>
            input.tiers.length > 0
              ? (team.preassignedByTier[index] ?? 0)
              : team.preassignedTotal,
          );
          let spent = team.spent;
          let total = team.preassignedTotal;
          for (const assignment of result.assignments) {
            if (assignment.teamId !== team.id) continue;
            const player = input.players.find(
              (candidate) => candidate.id === assignment.playerId,
            )!;
            const tierIndex = input.tiers.length > 0 ? player.tierIndex : 0;
            counts[tierIndex] = (counts[tierIndex] ?? 0) + 1;
            total += 1;
            spent += player.startingPrice;
          }
          expect(spent, `seed ${seed}`).toBeLessThanOrEqual(team.budget);
          expect(total, `seed ${seed}`).toBeLessThanOrEqual(input.rosterMax);
          if (input.tiers.length > 0) {
            for (const [index, tier] of input.tiers.entries()) {
              expect(counts[index] ?? 0, `seed ${seed}`).toBeLessThanOrEqual(
                tier.maxPerTeam,
              );
            }
          }
        }
      }
    }
  });

  it("fills a single deficient Team and Player pair", () => {
    const result = matchUnsoldPlayers({
      players: [{ id: "p1", startingPrice: 10, tierIndex: 0 }],
      random: () => 0,
      rosterMax: 3,
      rosterMin: 2,
      teams: [
        {
          budget: 100,
          id: "t1",
          preassignedByTier: [1],
          preassignedTotal: 1,
          spent: 10,
        },
        {
          budget: 100,
          id: "t2",
          preassignedByTier: [2],
          preassignedTotal: 2,
          spent: 20,
        },
      ],
      tiers: [{ label: "All", maxPerTeam: 3, minPerTeam: 2 }],
    });

    expect(result).toEqual({
      assignments: [{ playerId: "p1", teamId: "t1" }],
      possible: true,
    });
  });

  it("respects a Budget that cannot cover the only available Player", () => {
    const result = matchUnsoldPlayers({
      players: [{ id: "p1", startingPrice: 10, tierIndex: 0 }],
      rosterMax: 3,
      rosterMin: 2,
      teams: [
        {
          budget: 5,
          id: "t1",
          preassignedByTier: [1],
          preassignedTotal: 1,
          spent: 0,
        },
        {
          budget: 100,
          id: "t2",
          preassignedByTier: [2],
          preassignedTotal: 2,
          spent: 0,
        },
      ],
      tiers: [{ label: "All", maxPerTeam: 3, minPerTeam: 2 }],
    });

    expect(result.possible).toBe(false);
  });

  it("refuses a case where no complete assignment exists", () => {
    const result = matchUnsoldPlayers({
      players: [{ id: "p1", startingPrice: 10, tierIndex: 0 }],
      rosterMax: 2,
      rosterMin: 2,
      teams: [
        {
          budget: 100,
          id: "t1",
          preassignedByTier: [1],
          preassignedTotal: 1,
          spent: 0,
        },
        {
          budget: 100,
          id: "t2",
          preassignedByTier: [0],
          preassignedTotal: 0,
          spent: 0,
        },
      ],
      tiers: [{ label: "All", maxPerTeam: 2, minPerTeam: 1 }],
    });

    expect(result.possible).toBe(false);
  });

  it("finds a completion across several deficient Teams and Players", () => {
    const result = matchUnsoldPlayers({
      players: [
        { id: "p1", startingPrice: 10, tierIndex: 0 },
        { id: "p2", startingPrice: 10, tierIndex: 0 },
        { id: "p3", startingPrice: 10, tierIndex: 0 },
        { id: "p4", startingPrice: 10, tierIndex: 0 },
      ],
      random: () => 0.5,
      rosterMax: 2,
      rosterMin: 2,
      teams: [
        {
          budget: 100,
          id: "t1",
          preassignedByTier: [0],
          preassignedTotal: 0,
          spent: 0,
        },
        {
          budget: 100,
          id: "t2",
          preassignedByTier: [0],
          preassignedTotal: 0,
          spent: 0,
        },
      ],
      tiers: [{ label: "All", maxPerTeam: 2, minPerTeam: 0 }],
    });

    expect(result.possible).toBe(true);
    if (!result.possible) return;
    expect(result.assignments).toHaveLength(4);
  });

  it("chooses among feasible assignments with the supplied randomness", () => {
    const base: MatchingInput = {
      players: [
        { id: "p1", startingPrice: 10, tierIndex: 0 },
        { id: "p2", startingPrice: 10, tierIndex: 0 },
      ],
      rosterMax: 2,
      rosterMin: 1,
      teams: [
        {
          budget: 100,
          id: "t1",
          preassignedByTier: [0],
          preassignedTotal: 0,
          spent: 0,
        },
        {
          budget: 100,
          id: "t2",
          preassignedByTier: [0],
          preassignedTotal: 0,
          spent: 0,
        },
      ],
      tiers: [{ label: "All", maxPerTeam: 2, minPerTeam: 0 }],
    };

    const first = matchUnsoldPlayers({ ...base, random: () => 0 });
    const last = matchUnsoldPlayers({ ...base, random: () => 0.999 });

    expect(first.possible).toBe(true);
    expect(last.possible).toBe(true);
    // The two extremes of the randomness pick different complete assignments.
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(last));
  });
});
