import { describe, expect, it } from "vitest";

import { parseCustomFieldValues } from "@/features/auctions/live/live-player-details-dialog";
import { isMobileField } from "@/server/auction-query/live-snapshot";

describe("live player details parsing & privacy", () => {
  describe("parseCustomFieldValues", () => {
    it("splits comma-separated strings into clean, trimmed badges", () => {
      const input = "Striker, Winger , Captain,  Midfielder";
      const badges = parseCustomFieldValues(input);
      expect(badges).toEqual(["Striker", "Winger", "Captain", "Midfielder"]);
    });

    it("handles single values without commas as a single badge", () => {
      const input = "Radiant";
      const badges = parseCustomFieldValues(input);
      expect(badges).toEqual(["Radiant"]);
    });

    it("filters out empty or whitespace-only items", () => {
      const input = "AWP, , Rifler, , IGL, ";
      const badges = parseCustomFieldValues(input);
      expect(badges).toEqual(["AWP", "Rifler", "IGL"]);
    });

    it("returns an empty array for empty string", () => {
      expect(parseCustomFieldValues("")).toEqual([]);
      expect(parseCustomFieldValues("   ")).toEqual([]);
    });
  });

  describe("isMobileField (privacy enforcement)", () => {
    it("identifies phone and mobile related labels as mobile fields", () => {
      expect(isMobileField("Phone")).toBe(true);
      expect(isMobileField("Phone Number")).toBe(true);
      expect(isMobileField("Mobile")).toBe(true);
      expect(isMobileField("Mobile Number")).toBe(true);
      expect(isMobileField("Cell Phone")).toBe(true);
      expect(isMobileField("WhatsApp Number")).toBe(true);
      expect(isMobileField("contact number")).toBe(true);
    });

    it("preserves non-phone attributes", () => {
      expect(isMobileField("Role")).toBe(false);
      expect(isMobileField("Skills")).toBe(false);
      expect(isMobileField("Rank")).toBe(false);
      expect(isMobileField("Preferred Agents")).toBe(false);
      expect(isMobileField("Jersey Number")).toBe(false);
      expect(isMobileField("Experience")).toBe(false);
      expect(isMobileField("In-Game ID")).toBe(false);
    });
  });
});
