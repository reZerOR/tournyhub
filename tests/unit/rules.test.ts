import { describe, expect, it } from "vitest";

import {
  isSimpleRuleSetComplete,
  resolveStartingPrice,
  simpleRulesInputSchema,
  type AuctionRuleSet,
} from "@/domain/rules";

function ruleSet(overrides: Partial<AuctionRuleSet> = {}): AuctionRuleSet {
  return {
    auctionId: "auction-1",
    budget: 100,
    bidIncrement: 5,
    defaultStartingPrice: 10,
    rosterMax: 4,
    rosterMin: 2,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("simpleRulesInputSchema", () => {
  it("accepts whole numbers supplied as strings", () => {
    expect(
      simpleRulesInputSchema.parse({
        budget: "100",
        bidIncrement: " 5 ",
        defaultStartingPrice: "10",
        rosterMax: "4",
        rosterMin: "2",
      }),
    ).toEqual({
      budget: 100,
      bidIncrement: 5,
      defaultStartingPrice: 10,
      rosterMax: 4,
      rosterMin: 2,
    });
  });

  it("rejects zero, fractions, and text", () => {
    for (const value of ["0", "-1", "1.5", "abc", "1e3", ""]) {
      expect(
        simpleRulesInputSchema.safeParse({
          budget: value,
          bidIncrement: 5,
          defaultStartingPrice: 10,
          rosterMax: 4,
          rosterMin: 2,
        }).success,
        value,
      ).toBe(false);
    }
  });

  it("rejects a minimum above the maximum", () => {
    const result = simpleRulesInputSchema.safeParse({
      budget: 100,
      bidIncrement: 5,
      defaultStartingPrice: 10,
      rosterMax: 3,
      rosterMin: 4,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("cannot exceed");
    }
  });
});

describe("isSimpleRuleSetComplete", () => {
  it("accepts a fully configured rule set", () => {
    expect(isSimpleRuleSetComplete(ruleSet())).toBe(true);
  });

  it("requires every field and a valid range", () => {
    expect(isSimpleRuleSetComplete(ruleSet({ budget: null }))).toBe(false);
    expect(isSimpleRuleSetComplete(ruleSet({ rosterMin: null }))).toBe(false);
    expect(
      isSimpleRuleSetComplete(ruleSet({ rosterMax: 1, rosterMin: 2 })),
    ).toBe(false);
    expect(isSimpleRuleSetComplete(ruleSet({ budget: 0 }))).toBe(false);
  });
});

describe("resolveStartingPrice", () => {
  it("prefers the Player override over the default", () => {
    expect(resolveStartingPrice(25, 10)).toBe(25);
    expect(resolveStartingPrice(null, 10)).toBe(10);
  });
});
