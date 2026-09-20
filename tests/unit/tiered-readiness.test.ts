import { describe, expect, it } from "vitest";

import { evaluateReadiness, type ReadinessInput } from "@/domain/readiness";
import type { AuctionRuleSet } from "@/domain/rules";

function ruleSet(overrides: Partial<AuctionRuleSet> = {}): AuctionRuleSet {
  return {
    auctionId: "auction-1",
    budget: 100,
    bidIncrement: 5,
    defaultStartingPrice: null,
    rosterMax: 4,
    rosterMin: 3,
    updatedAt: new Date(),
    ...overrides,
  };
}

function tiers() {
  return [
    {
      id: "tier-bronze",
      label: "Bronze",
      maxPerTeam: 2,
      minPerTeam: 1,
      position: 0,
      startingPrice: 10,
    },
    {
      id: "tier-gold",
      label: "Gold",
      maxPerTeam: 1,
      minPerTeam: 1,
      position: 1,
      startingPrice: 50,
    },
  ];
}

function input(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    auctionId: "auction-1",
    disconnectedRepresentativeUserIds: [],
    players: [
      { startingPrice: 10, tierId: "tier-bronze" },
      { startingPrice: 10, tierId: "tier-bronze" },
      { startingPrice: 10, tierId: "tier-bronze" },
      { startingPrice: 10, tierId: "tier-bronze" },
      { startingPrice: 50, tierId: "tier-gold" },
      { startingPrice: 50, tierId: "tier-gold" },
    ],
    ruleSet: ruleSet(),
    rulesMode: "tiered",
    teams: [
      {
        id: "t1",
        name: "Reds",
        preassignedByTier: {},
        preassignedCount: 0,
        representativeUserId: "u1",
      },
      {
        id: "t2",
        name: "Blues",
        preassignedByTier: {},
        preassignedCount: 0,
        representativeUserId: "u2",
      },
    ],
    tiers: tiers(),
    ...overrides,
  };
}

function groups(readiness: ReturnType<typeof evaluateReadiness>) {
  return readiness.errors.map((issue) => issue.group);
}

describe("evaluateReadiness under Tiered Rules", () => {
  it("is ready when Tiers, Players, Rules, and feasibility all hold", () => {
    expect(evaluateReadiness(input()).ready).toBe(true);
  });

  it("requires each biddable Player to have a Tier", () => {
    const readiness = evaluateReadiness(
      input({
        players: [{ startingPrice: 10, tierId: null }],
      }),
    );

    expect(readiness.ready).toBe(false);
    expect(groups(readiness)).toContain("tiers");
    expect(
      readiness.errors.find((issue) => issue.group === "tiers")?.message,
    ).toContain("Tier");
  });

  it("requires at least one Tier", () => {
    const readiness = evaluateReadiness(input({ tiers: [] }));

    expect(groups(readiness)).toContain("tiers");
    expect(
      readiness.errors.find((issue) => issue.group === "tiers")?.message,
    ).toContain("at least one Tier");
  });

  it("reports a Tiered feasibility error when minimums cannot be met", () => {
    const readiness = evaluateReadiness(
      input({
        players: [
          { startingPrice: 10, tierId: "tier-bronze" },
          { startingPrice: 10, tierId: "tier-bronze" },
          { startingPrice: 50, tierId: "tier-gold" },
        ],
      }),
    );

    expect(readiness.ready).toBe(false);
    expect(groups(readiness)).toContain("feasibility");
    expect(
      readiness.errors.find((issue) => issue.group === "feasibility")?.message,
    ).toContain("Gold");
  });

  it("requires the shared Tiered Rules before start", () => {
    const readiness = evaluateReadiness(
      input({ ruleSet: ruleSet({ budget: null }) }),
    );

    expect(groups(readiness)).toContain("rules");
  });

  it("reports Tier maximums that cannot reach the Roster minimum", () => {
    const readiness = evaluateReadiness(
      input({
        ruleSet: ruleSet({ rosterMin: 3 }),
        tiers: [
          {
            id: "tier-bronze",
            label: "Bronze",
            maxPerTeam: 1,
            minPerTeam: 0,
            position: 0,
            startingPrice: 10,
          },
        ],
      }),
    );

    expect(groups(readiness)).toContain("tiers");
  });
});
