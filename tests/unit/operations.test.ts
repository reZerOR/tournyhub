import { describe, expect, it } from "vitest";

import { parseEnvironment } from "@/config/environment";
import { normalizeConnectionString } from "@/server/database/connection-string";
import type { Queryable } from "@/server/database/queryable";
import { checkHealth, environmentName } from "@/server/observability/health";
import {
  buildLogEntry,
  errorCode,
  redactFields,
} from "@/server/observability/logger";
import {
  compareMigrations,
  parseMigrationVersion,
  readMigrationVersions,
} from "@/server/operations/migrations";

const BASE_ENVIRONMENT = {
  BETTER_AUTH_SECRET: "x".repeat(40),
  DATABASE_URL: "postgresql://user:pass@127.0.0.1:54322/postgres",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
};

describe("structured logging", () => {
  it("redacts every sensitive field at any depth", () => {
    const entry = buildLogEntry("info", "command.completed", {
      auctionId: "auction-1",
      authorization: "Bearer secret",
      commandId: "command-1",
      latencyMs: 42,
      nested: {
        importPayload: "a,b,c",
        phoneNumber: "+8801111111",
        playerEntryId: "player-1",
      },
    });

    expect(entry.auctionId).toBe("auction-1");
    expect(entry.commandId).toBe("command-1");
    expect(entry.latencyMs).toBe(42);
    expect(entry.authorization).toBe("[redacted]");
    expect(entry.nested).toMatchObject({
      importPayload: "[redacted]",
      phoneNumber: "[redacted]",
      playerEntryId: "player-1",
    });
  });

  it("never returns a sensitive value even when the key only suggests it", () => {
    const redacted = redactFields({
      cookie: "session=abc",
      emailBody: "Your code is 123456",
      invitationToken: "token",
      otp: "123456",
      snapshot: { teams: [] },
    });
    expect(Object.values(redacted)).toEqual([
      "[redacted]",
      "[redacted]",
      "[redacted]",
      "[redacted]",
      "[redacted]",
    ]);
  });

  it("records a stable error code instead of a provider message", () => {
    expect(errorCode({ code: "23505" })).toBe("23505");
    expect(errorCode(new Error("connection string postgres://secret"))).toBe(
      "unexpected_error",
    );
    expect(errorCode(null)).toBe("unexpected_error");
  });
});

describe("health report", () => {
  const healthyDatabase = {
    query: async () => ({ rows: [] }),
  } as unknown as Queryable;

  it("reports ok when every dependency answers", async () => {
    const report = await checkHealth(healthyDatabase, BASE_ENVIRONMENT);
    expect(report.status).toBe("ok");
    expect(report.checks.map((check) => check.name)).toEqual([
      "application",
      "database",
      "authentication",
      "realtime",
    ]);
  });

  it("degrades without leaking a detail when the database is unavailable", async () => {
    const failingDatabase = {
      query: async () => {
        throw new Error("connect ECONNREFUSED postgres://secret");
      },
    } as unknown as Queryable;
    const report = await checkHealth(failingDatabase, BASE_ENVIRONMENT);
    expect(report.status).toBe("degraded");
    expect(JSON.stringify(report)).not.toContain("secret");
    expect(JSON.stringify(report)).not.toContain("postgres://");
  });

  it("names the environment once, from an explicit value or the platform", () => {
    expect(environmentName({ APP_ENVIRONMENT: "preview" })).toBe("preview");
    expect(environmentName({ VERCEL_ENV: "production" })).toBe("production");
    expect(environmentName({ NODE_ENV: "production" })).toBe("production");
    expect(environmentName({})).toBe("development");
  });
});

describe("migration status", () => {
  it("reads Supabase-style migration versions", () => {
    expect(parseMigrationVersion("20260922100000_paused_changes.sql")).toBe(
      "20260922100000",
    );
    expect(parseMigrationVersion("notes.md")).toBeNull();
    expect(
      readMigrationVersions([
        "20260922100000_b.sql",
        "20260920140000_a.sql",
        "README.md",
      ]),
    ).toEqual(["20260920140000", "20260922100000"]);
  });

  it("reports drift in both directions", () => {
    expect(compareMigrations(["1", "2"], ["1", "2"])).toMatchObject({
      ok: true,
    });

    const report = compareMigrations(["1", "2"], ["1", "3"]);
    expect(report).toMatchObject({ extra: ["3"], missing: ["2"], ok: false });
  });
});

describe("environment separation", () => {
  it("accepts a preview environment that uses its own database", () => {
    expect(
      parseEnvironment({
        ...BASE_ENVIRONMENT,
        APP_ENVIRONMENT: "preview",
        PRODUCTION_DATABASE_URL: "postgresql://prod@example.com/postgres",
      }).APP_ENVIRONMENT,
    ).toBe("preview");
  });

  it("refuses a preview environment pointed at the production database", () => {
    expect(() =>
      parseEnvironment({
        ...BASE_ENVIRONMENT,
        APP_ENVIRONMENT: "preview",
        PRODUCTION_DATABASE_URL: BASE_ENVIRONMENT.DATABASE_URL,
      }),
    ).toThrow(/production database/);
  });

  it("refuses the administrator bootstrap value on a preview deployment", () => {
    expect(() =>
      parseEnvironment({
        ...BASE_ENVIRONMENT,
        APP_ENVIRONMENT: "preview",
        PLATFORM_ADMIN_BOOTSTRAP_EMAIL: "operator@example.com",
      }),
    ).toThrow(/must not be set on a Preview deployment/);
  });

  it("allows the production environment to hold both values", () => {
    expect(() =>
      parseEnvironment({
        ...BASE_ENVIRONMENT,
        APP_ENVIRONMENT: "production",
        PLATFORM_ADMIN_BOOTSTRAP_EMAIL: "operator@example.com",
        PRODUCTION_DATABASE_URL: BASE_ENVIRONMENT.DATABASE_URL,
      }),
    ).not.toThrow();
  });
});

describe("normalizeConnectionString", () => {
  it("leaves local connection URLs unchanged", () => {
    const local = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    expect(normalizeConnectionString(local)).toBe(local);
  });

  it("adds sslmode=no-verify to Supabase URLs missing sslmode", () => {
    const url =
      "postgresql://postgres.ref:pass@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";
    expect(normalizeConnectionString(url)).toBe(`${url}?sslmode=no-verify`);
  });

  it("rewrites sslmode=require to sslmode=no-verify on Supabase hosts", () => {
    const url =
      "postgresql://postgres.ref:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require";
    expect(normalizeConnectionString(url)).toBe(
      "postgresql://postgres.ref:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=no-verify",
    );
  });
});
