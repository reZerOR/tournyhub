import { describe, expect, it } from "vitest";

import { evaluateReadiness, type ReadinessInput } from "@/domain/readiness";
import type { AuctionRuleSet } from "@/domain/rules";

function ruleSet(overrides: Partial<AuctionRuleSet> = {}): AuctionRuleSet {
  return {
    auctionId: "auction-1",
    budget: 100,
    bidIncrement: 5,
    defaultStartingPrice: 10,
    rosterMax: 3,
    rosterMin: 2,
    updatedAt: new Date(),
    ...overrides,
  };
}

function input(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    auctionId: "auction-1",
    disconnectedRepresentativeUserIds: [],
    players: [
      { startingPrice: 10 },
      { startingPrice: 10 },
      { startingPrice: 10 },
      { startingPrice: 10 },
    ],
    ruleSet: ruleSet(),
    teams: [
      {
        id: "t1",
        name: "Reds",
        preassignedCount: 0,
        representativeUserId: "u1",
      },
      {
        id: "t2",
        name: "Blues",
        preassignedCount: 0,
        representativeUserId: "u2",
      },
    ],
    ...overrides,
  };
}

function groups(readiness: ReturnType<typeof evaluateReadiness>) {
  return readiness.errors.map((issue) => issue.group);
}

describe("evaluateReadiness", () => {
  it("is ready when Teams, representatives, Rules, and feasibility all hold", () => {
    const readiness = evaluateReadiness(input());

    expect(readiness.ready).toBe(true);
    expect(readiness.errors).toEqual([]);
  });

  it("requires at least two named Teams", () => {
    const readiness = evaluateReadiness(
      input({
        teams: [
          {
            id: "t1",
            name: null,
            preassignedCount: 0,
            representativeUserId: "u1",
          },
        ],
      }),
    );

    expect(readiness.ready).toBe(false);
    expect(groups(readiness)).toContain("teams");
  });

  it("requires a representative for every Team", () => {
    const readiness = evaluateReadiness(
      input({
        teams: [
          {
            id: "t1",
            name: "Reds",
            preassignedCount: 0,
            representativeUserId: null,
          },
          {
            id: "t2",
            name: "Blues",
            preassignedCount: 0,
            representativeUserId: "u2",
          },
        ],
      }),
    );

    expect(groups(readiness)).toContain("invitations");
    expect(readiness.errors[0]?.href).toContain("/setup/representatives");
  });

  it("warns about disconnected representatives without blocking", () => {
    const readiness = evaluateReadiness(
      input({ disconnectedRepresentativeUserIds: ["u1"] }),
    );

    expect(readiness.ready).toBe(true);
    expect(readiness.warnings).toHaveLength(1);
    expect(readiness.warnings[0]?.message).toContain("disconnected");
  });

  it("requires a complete rule set and Players", () => {
    const readiness = evaluateReadiness(
      input({ players: [], ruleSet: ruleSet({ budget: null }) }),
    );

    expect(groups(readiness)).toContain("rules");
    expect(groups(readiness)).toContain("players");
  });

  it("reports a feasibility error when no Legal Completion exists", () => {
    const readiness = evaluateReadiness(
      input({
        players: [{ startingPrice: 10 }],
        ruleSet: ruleSet({ rosterMax: 3, rosterMin: 2 }),
      }),
    );

    expect(readiness.ready).toBe(false);
    expect(groups(readiness)).toContain("feasibility");
    expect(
      readiness.errors.find((issue) => issue.group === "feasibility")?.message,
    ).toContain("Not enough Players");
  });
});
