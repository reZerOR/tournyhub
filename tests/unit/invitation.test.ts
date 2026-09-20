import { describe, expect, it } from "vitest";

import {
  createInvitationToken,
  digestInvitationToken,
  invitationEmailSchema,
  invitationExpiresAt,
  INVITATION_EXPIRY_MS,
  normalizeEmail,
} from "@/domain/invitation";

describe("normalizeEmail and invitationEmailSchema", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeEmail("  Alice@Example.COM ")).toBe("alice@example.com");
  });

  it("accepts a valid address and rejects an invalid one", () => {
    expect(invitationEmailSchema.parse(" Alice@Example.com ")).toBe(
      "alice@example.com",
    );
    expect(invitationEmailSchema.safeParse("not-an-email").success).toBe(false);
    expect(invitationEmailSchema.safeParse("").success).toBe(false);
  });
});

describe("invitation tokens", () => {
  it("stores a digest that matches the token and never the raw token", () => {
    const { digest, token } = createInvitationToken();

    expect(digest).toBe(digestInvitationToken(token));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(token);
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it("creates a different token every time", () => {
    expect(createInvitationToken().digest).not.toBe(
      createInvitationToken().digest,
    );
  });

  it("expires seven days after it is issued", () => {
    const now = new Date("2026-09-21T00:00:00.000Z");
    expect(invitationExpiresAt(now).getTime()).toBe(
      now.getTime() + INVITATION_EXPIRY_MS,
    );
  });
});
