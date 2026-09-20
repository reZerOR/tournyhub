import { describe, expect, it } from "vitest";

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_LIMITS,
  sanitizeFeedbackMessage,
  submitFeedbackInputSchema,
} from "@/domain/feedback";

function input(overrides: Record<string, unknown> = {}) {
  return {
    category: "bug",
    message: "The Bid button did nothing on my phone.",
    page: "/app/auctions/123/live",
    ...overrides,
  };
}

describe("submitFeedbackInputSchema", () => {
  it("accepts a report from a main application page", () => {
    const parsed = submitFeedbackInputSchema.parse(input());
    expect(parsed.category).toBe("bug");
    expect(parsed.page).toBe("/app/auctions/123/live");
  });

  it("accepts every published category and rejects an unknown one", () => {
    for (const category of FEEDBACK_CATEGORIES) {
      expect(
        submitFeedbackInputSchema.parse(input({ category })).category,
      ).toBe(category);
    }
    expect(() =>
      submitFeedbackInputSchema.parse(input({ category: "urgent" })),
    ).toThrow();
  });

  it("enforces the message length limits", () => {
    expect(() =>
      submitFeedbackInputSchema.parse(input({ message: "short" })),
    ).toThrow();
    expect(() =>
      submitFeedbackInputSchema.parse(input({ message: "x".repeat(2001) })),
    ).toThrow();
    expect(
      submitFeedbackInputSchema.parse(
        input({ message: "x".repeat(FEEDBACK_LIMITS.messageMax) }),
      ).message,
    ).toHaveLength(FEEDBACK_LIMITS.messageMax);
  });

  it("refuses a page outside TournyHub or carrying a query string", () => {
    for (const page of [
      "https://example.com/app",
      "/sign-in",
      "/app/auctions/1?token=secret",
      "/app/auctions/1#section",
      "//evil.example.com",
    ]) {
      expect(() => submitFeedbackInputSchema.parse(input({ page }))).toThrow();
    }
  });
});

describe("sanitizeFeedbackMessage", () => {
  it("collapses whitespace so a stored message cannot carry markup layout", () => {
    expect(sanitizeFeedbackMessage("  a\n\n b\t c  ")).toBe("a b c");
  });
});
