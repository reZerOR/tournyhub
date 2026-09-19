import { describe, expect, it } from "vitest";

import { parseEnvironment } from "@/config/environment";

const validEnvironment = {
  BETTER_AUTH_SECRET: "a".repeat(32),
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "local-service-role-key",
};

function captureEnvironmentError(
  overrides: Record<string, string | undefined>,
): string {
  try {
    parseEnvironment({ ...validEnvironment, ...overrides });
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }

    throw error;
  }

  throw new Error("Expected environment validation to fail.");
}

describe("environment validation", () => {
  it("accepts the complete application environment", () => {
    expect(parseEnvironment(validEnvironment)).toEqual(validEnvironment);
  });

  it("names missing variables without exposing configured secret values", () => {
    const privateValue = "do-not-print-this-value";
    const errorMessage = captureEnvironmentError({
      DATABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: privateValue,
    });

    expect(errorMessage).toContain("DATABASE_URL");
    expect(errorMessage).not.toContain(privateValue);
  });

  it("rejects a low-entropy auth secret", () => {
    const errorMessage = captureEnvironmentError({
      BETTER_AUTH_SECRET: "too-short",
    });

    expect(errorMessage).toContain("BETTER_AUTH_SECRET");
  });

  it("does not expose a malformed database URL", () => {
    const privateValue = "do-not-print-this-password";
    const errorMessage = captureEnvironmentError({
      DATABASE_URL: `postgresql://postgres:${privateValue}@[`,
    });

    expect(errorMessage).toContain("DATABASE_URL");
    expect(errorMessage).not.toContain(privateValue);
  });
});
