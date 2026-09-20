import { describe, expect, it } from "vitest";

import {
  ADMIN_BOOTSTRAP_ENV,
  auctionModerationInputSchema,
  MODERATION_ACTIONS,
  moderationReasonSchema,
  suspendUserInputSchema,
} from "@/domain/administration";

describe("moderation input", () => {
  it("requires a reason for every moderation action", () => {
    expect(moderationReasonSchema.parse("  Abusive content  ")).toBe(
      "Abusive content",
    );
    expect(() => moderationReasonSchema.parse("   ")).toThrow();
    expect(() => moderationReasonSchema.parse("x".repeat(201))).toThrow();
  });

  it("validates a User action and an Auction action", () => {
    expect(
      suspendUserInputSchema.parse({ reason: "Spam", userId: "user-1" }),
    ).toMatchObject({ userId: "user-1" });
    expect(() => suspendUserInputSchema.parse({ reason: "Spam" })).toThrow();
    expect(
      auctionModerationInputSchema.parse({
        auctionId: "3d9e5f6a-0000-4000-8000-000000000000",
        reason: "Prohibited content",
      }).reason,
    ).toBe("Prohibited content");
  });

  it("publishes the moderation vocabulary and the bootstrap variable name", () => {
    for (const action of [
      "inspect_auction",
      "suspend_user",
      "restore_user",
      "revoke_sessions",
      "hide_auction",
      "unhide_auction",
      "bootstrap_administrator",
    ]) {
      expect(MODERATION_ACTIONS).toContain(action);
    }
    expect(ADMIN_BOOTSTRAP_ENV).toBe("PLATFORM_ADMIN_BOOTSTRAP_EMAIL");
  });
});
