import { describe, expect, it } from "vitest";

import {
  customPlayerFieldInputSchema,
  findDuplicateDisplayNames,
  normalizeDisplayName,
  playerEntryInputSchema,
} from "@/domain/player-entry";

const FIELD_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("normalizeDisplayName", () => {
  it("ignores case and surrounding or repeated whitespace", () => {
    expect(normalizeDisplayName("  Alice   SMITH ")).toBe("alice smith");
    expect(normalizeDisplayName("alice smith")).toBe("alice smith");
    expect(normalizeDisplayName("ALICE\tSMITH")).toBe("alice smith");
  });
});

describe("findDuplicateDisplayNames", () => {
  it("returns only the names shared by more than one entry", () => {
    const duplicates = findDuplicateDisplayNames([
      { displayName: "Alice" },
      { displayName: " alice " },
      { displayName: "Bob" },
      { displayName: "Casey" },
      { displayName: "Casey" },
    ]);

    expect([...duplicates].sort()).toEqual(["alice", "casey"]);
  });

  it("returns an empty set when every name is distinct", () => {
    expect(
      findDuplicateDisplayNames([
        { displayName: "Alice" },
        { displayName: "Bob" },
      ]).size,
    ).toBe(0);
  });
});

describe("playerEntryInputSchema", () => {
  it("accepts a display name alone and nulls the empty optional fields", () => {
    const parsed = playerEntryInputSchema.parse({
      displayName: "  Alice  ",
      externalPlayerId: " ",
      phoneNumber: "",
      role: "",
      startingPriceOverride: "",
    });

    expect(parsed).toEqual({
      customValues: {},
      displayName: "Alice",
      externalPlayerId: null,
      phoneNumber: null,
      role: null,
      startingPriceOverride: null,
    });
  });

  it("keeps supplied optional values", () => {
    const parsed = playerEntryInputSchema.parse({
      displayName: "Alice",
      externalPlayerId: "uid-1",
      phoneNumber: "+1 (555) 010-2030",
      role: "Goalkeeper",
      startingPriceOverride: 25,
      customValues: { [FIELD_ID]: "Defender" },
    });

    expect(parsed).toMatchObject({
      externalPlayerId: "uid-1",
      phoneNumber: "+1 (555) 010-2030",
      role: "Goalkeeper",
      startingPriceOverride: 25,
      customValues: { [FIELD_ID]: "Defender" },
    });
  });

  it("accepts a numeric string starting price and rejects invalid ones", () => {
    expect(
      playerEntryInputSchema.parse({
        displayName: "Alice",
        startingPriceOverride: " 30 ",
      }).startingPriceOverride,
    ).toBe(30);

    for (const startingPriceOverride of [
      "0",
      "-5",
      "1.5",
      "abc",
      "1e3",
      "0x10",
      "1 0",
    ]) {
      expect(
        playerEntryInputSchema.safeParse({
          displayName: "Alice",
          startingPriceOverride,
        }).success,
      ).toBe(false);
    }
  });

  it("accepts common phone number formats", () => {
    for (const phoneNumber of [
      "(555) 010-2030",
      "+1 555 010 2030",
      "5550102030",
    ]) {
      expect(
        playerEntryInputSchema.parse({ displayName: "Alice", phoneNumber })
          .phoneNumber,
      ).toBe(phoneNumber);
    }
  });

  it("rejects a blank or over-long display name", () => {
    expect(
      playerEntryInputSchema.safeParse({ displayName: "   " }).success,
    ).toBe(false);
    expect(
      playerEntryInputSchema.safeParse({ displayName: "a".repeat(101) })
        .success,
    ).toBe(false);
  });

  it("rejects over-long optional fields and invalid phone numbers", () => {
    const base = { displayName: "Alice" };
    expect(
      playerEntryInputSchema.safeParse({ ...base, role: "a".repeat(61) })
        .success,
    ).toBe(false);
    expect(
      playerEntryInputSchema.safeParse({
        ...base,
        externalPlayerId: "a".repeat(101),
      }).success,
    ).toBe(false);
    expect(
      playerEntryInputSchema.safeParse({
        ...base,
        phoneNumber: "a".repeat(41),
      }).success,
    ).toBe(false);
    expect(
      playerEntryInputSchema.safeParse({ ...base, phoneNumber: "not a phone" })
        .success,
    ).toBe(false);
  });

  it("rejects an over-long custom value and a non-uuid field id", () => {
    expect(
      playerEntryInputSchema.safeParse({
        displayName: "Alice",
        customValues: { [FIELD_ID]: "a".repeat(201) },
      }).success,
    ).toBe(false);
    expect(
      playerEntryInputSchema.safeParse({
        displayName: "Alice",
        customValues: { "not-a-uuid": "ok" },
      }).success,
    ).toBe(false);
  });
});

describe("customPlayerFieldInputSchema", () => {
  it("trims a valid label", () => {
    expect(
      customPlayerFieldInputSchema.parse({ label: "  Position " }).label,
    ).toBe("Position");
  });

  it("rejects a blank or over-long label", () => {
    expect(customPlayerFieldInputSchema.safeParse({ label: " " }).success).toBe(
      false,
    );
    expect(
      customPlayerFieldInputSchema.safeParse({ label: "a".repeat(61) }).success,
    ).toBe(false);
  });
});
