import { describe, expect, it } from "vitest";

import {
  normalizeTierLabel,
  sumTierMaximums,
  sumTierMinimums,
  tierInputSchema,
} from "@/domain/tier";

describe("tierInputSchema", () => {
  it("accepts whole numbers supplied as strings", () => {
    expect(
      tierInputSchema.parse({
        label: "  Gold  ",
        maxPerTeam: "3",
        minPerTeam: "1",
        startingPrice: "250",
      }),
    ).toEqual({
      label: "Gold",
      maxPerTeam: 3,
      minPerTeam: 1,
      startingPrice: 250,
    });
  });

  it("rejects zero starting prices, fractions, and text", () => {
    for (const value of ["0", "-5", "1.5", "abc", "1e3", ""]) {
      expect(
        tierInputSchema.safeParse({
          label: "Gold",
          maxPerTeam: 3,
          minPerTeam: 1,
          startingPrice: value,
        }).success,
        value,
      ).toBe(false);
    }
  });

  it("rejects a minimum above the maximum", () => {
    const result = tierInputSchema.safeParse({
      label: "Gold",
      maxPerTeam: 2,
      minPerTeam: 3,
      startingPrice: 10,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("cannot exceed");
    }
  });

  it("allows a zero minimum", () => {
    expect(
      tierInputSchema.safeParse({
        label: "Bronze",
        maxPerTeam: 2,
        minPerTeam: 0,
        startingPrice: 10,
      }).success,
    ).toBe(true);
  });
});

describe("normalizeTierLabel", () => {
  it("collapses case, surrounding, and repeated whitespace", () => {
    expect(normalizeTierLabel("  Gold   Medal ")).toBe("gold medal");
  });
});

describe("tier sums", () => {
  it("sums the shared per-Team minimums and maximums", () => {
    const tiers = [
      { maxPerTeam: 2, minPerTeam: 1 },
      { maxPerTeam: 4, minPerTeam: 0 },
    ];
    expect(sumTierMinimums(tiers)).toBe(1);
    expect(sumTierMaximums(tiers)).toBe(6);
  });
});
