import { describe, expect, it } from "vitest";

import { calculateFeasibleTeamCounts } from "@/domain/team-calculator";

describe("calculateFeasibleTeamCounts", () => {
  it("returns every count that can hold the pool and fill each Team", () => {
    const result = calculateFeasibleTeamCounts({
      maxRosterSize: 10,
      minRosterSize: 5,
      playerCount: 30,
      preassignedRepresentativeCount: 0,
    });

    expect(result.feasibleCounts).toEqual([3, 4, 5, 6]);
    expect(result.recommendation).toBe(6);
    expect(result.explanation).toBe("");
  });

  it("keeps preassigned representatives from splitting across Teams", () => {
    const result = calculateFeasibleTeamCounts({
      maxRosterSize: 4,
      minRosterSize: 2,
      playerCount: 8,
      preassignedRepresentativeCount: 3,
    });

    expect(result.feasibleCounts).toEqual([3, 4]);
    expect(result.recommendation).toBe(4);
  });

  it("recommends the beta's 16-Team target when the range allows it", () => {
    const result = calculateFeasibleTeamCounts({
      maxRosterSize: 100,
      minRosterSize: 1,
      playerCount: 100,
      preassignedRepresentativeCount: 0,
    });

    expect(result.feasibleCounts[0]).toBe(2);
    expect(result.feasibleCounts.at(-1)).toBe(32);
    expect(result.recommendation).toBe(16);
  });

  it("explains that too few Players cannot fill two Teams", () => {
    const result = calculateFeasibleTeamCounts({
      maxRosterSize: 4,
      minRosterSize: 2,
      playerCount: 3,
      preassignedRepresentativeCount: 0,
    });

    expect(result.feasibleCounts).toEqual([]);
    expect(result.recommendation).toBeNull();
    expect(result.explanation).toContain("cannot fill two Teams");
  });

  it("explains that too many Players need more than the 32-Team limit", () => {
    const result = calculateFeasibleTeamCounts({
      maxRosterSize: 1,
      minRosterSize: 1,
      playerCount: 2000,
      preassignedRepresentativeCount: 0,
    });

    expect(result.feasibleCounts).toEqual([]);
    expect(result.explanation).toContain("32-Team limit");
  });

  it("explains that too many representatives exceed the Team limit", () => {
    const result = calculateFeasibleTeamCounts({
      maxRosterSize: 100,
      minRosterSize: 1,
      playerCount: 100,
      preassignedRepresentativeCount: 40,
    });

    expect(result.feasibleCounts).toEqual([]);
    expect(result.explanation).toContain("Player Representatives");
  });

  it("rejects an inverted or empty Roster range", () => {
    expect(() =>
      calculateFeasibleTeamCounts({
        maxRosterSize: 4,
        minRosterSize: 5,
        playerCount: 10,
        preassignedRepresentativeCount: 0,
      }),
    ).toThrow();
    expect(() =>
      calculateFeasibleTeamCounts({
        maxRosterSize: 4,
        minRosterSize: 0,
        playerCount: 10,
        preassignedRepresentativeCount: 0,
      }),
    ).toThrow();
  });

  it("accepts form strings", () => {
    const result = calculateFeasibleTeamCounts({
      maxRosterSize: "10",
      minRosterSize: "5",
      playerCount: "30",
      preassignedRepresentativeCount: "0",
    });

    expect(result.feasibleCounts).toEqual([3, 4, 5, 6]);
  });
});
