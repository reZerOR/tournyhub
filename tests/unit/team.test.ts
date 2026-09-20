import { describe, expect, it } from "vitest";

import {
  createTeamInputSchema,
  normalizeTeamName,
  teamColorSchema,
  teamNameSchema,
  updateTeamInputSchema,
} from "@/domain/team";

describe("normalizeTeamName", () => {
  it("ignores case and surrounding or repeated whitespace", () => {
    expect(normalizeTeamName("  Red   Comets ")).toBe("red comets");
    expect(normalizeTeamName("red comets")).toBe("red comets");
    expect(normalizeTeamName("RED\tCOMETS")).toBe("red comets");
  });
});

describe("teamNameSchema", () => {
  it("trims and collapses whitespace in a valid name", () => {
    expect(teamNameSchema.parse("  Red Comets ")).toBe("Red Comets");
    expect(teamNameSchema.parse("Red   Comets")).toBe("Red Comets");
  });

  it("rejects a blank or over-long name", () => {
    expect(teamNameSchema.safeParse("   ").success).toBe(false);
    expect(teamNameSchema.safeParse("a".repeat(101)).success).toBe(false);
    expect(teamNameSchema.safeParse("a".repeat(100)).success).toBe(true);
  });
});

describe("teamColorSchema", () => {
  it("normalizes a color to lowercase", () => {
    expect(teamColorSchema.parse("#1A2B3C")).toBe("#1a2b3c");
  });

  it("treats an empty value as no color", () => {
    expect(teamColorSchema.parse("")).toBeNull();
    expect(teamColorSchema.parse("   ")).toBeNull();
    expect(teamColorSchema.parse(null)).toBeNull();
  });

  it("rejects names and short hex values", () => {
    for (const value of ["red", "#fff", "#12345", "#1234567", "1a2b3c"]) {
      expect(teamColorSchema.safeParse(value).success, value).toBe(false);
    }
  });
});

describe("team input schemas", () => {
  it("requires a name and defaults the color", () => {
    expect(createTeamInputSchema.parse({ name: "Red Comets" })).toEqual({
      color: null,
      name: "Red Comets",
    });
    expect(createTeamInputSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("accepts a color on update", () => {
    expect(
      updateTeamInputSchema.parse({ color: "#ABCDEF", name: "Blue" }),
    ).toEqual({ color: "#abcdef", name: "Blue" });
  });
});
