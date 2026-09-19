import { describe, expect, it } from "vitest";

import {
  evaluateOtpRequestRate,
  normalizeOtpEmail,
  secondsUntilCooldownExpires,
} from "@/server/auth/otp-request-log";

describe("normalizeOtpEmail", () => {
  it("trims whitespace and lowercases the address", () => {
    expect(normalizeOtpEmail("  Player@Example.COM  ")).toBe(
      "player@example.com",
    );
  });
});

describe("secondsUntilCooldownExpires", () => {
  it("returns the remaining whole seconds of the cooldown", () => {
    const lastRequestedAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-01T00:00:31.400Z");

    expect(secondsUntilCooldownExpires(lastRequestedAt, now, 60)).toBe(29);
  });

  it("returns zero once the cooldown has fully elapsed", () => {
    const lastRequestedAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-01T00:01:00.000Z");

    expect(secondsUntilCooldownExpires(lastRequestedAt, now, 60)).toBe(0);
  });
});

describe("evaluateOtpRequestRate", () => {
  const options = { cooldownSeconds: 60, maxRequests: 5, windowSeconds: 3600 };
  const now = new Date("2026-01-01T00:10:00.000Z");

  it("allows the first request for an email with no history", () => {
    expect(evaluateOtpRequestRate([], now, options)).toEqual({
      allowed: true,
    });
  });

  it("rejects a request made before the cooldown expires", () => {
    const lastRequestedAt = new Date("2026-01-01T00:09:45.000Z");

    const decision = evaluateOtpRequestRate([lastRequestedAt], now, options);

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(45);
  });

  it("allows a request once the cooldown has passed", () => {
    const lastRequestedAt = new Date("2026-01-01T00:09:00.000Z");

    expect(evaluateOtpRequestRate([lastRequestedAt], now, options)).toEqual({
      allowed: true,
    });
  });

  it("rejects once the request count reaches the window cap", () => {
    const recentRequests = [
      new Date("2026-01-01T00:09:00.000Z"),
      new Date("2026-01-01T00:08:00.000Z"),
      new Date("2026-01-01T00:07:00.000Z"),
      new Date("2026-01-01T00:06:00.000Z"),
      new Date("2026-01-01T00:05:00.000Z"),
    ];

    const decision = evaluateOtpRequestRate(recentRequests, now, options);

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(options.windowSeconds);
  });
});
