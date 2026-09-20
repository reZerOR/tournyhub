import type { Queryable } from "@/server/database/queryable";

export interface HealthCheck {
  /** A stable, non-sensitive name. */
  name: string;
  /** `ok` or the dependency that is unavailable. */
  status: "degraded" | "ok";
}

export interface HealthReport {
  checks: HealthCheck[];
  environment: string;
  status: "degraded" | "ok";
  time: string;
}

/** The environment name this process runs as, without exposing any value. */
export function environmentName(
  environment: Record<string, string | undefined> = process.env,
): string {
  const explicit = environment.APP_ENVIRONMENT;
  if (
    explicit === "development" ||
    explicit === "preview" ||
    explicit === "production"
  ) {
    return explicit;
  }
  if (environment.VERCEL_ENV === "preview") return "preview";
  if (environment.VERCEL_ENV === "production") return "production";
  return environment.NODE_ENV === "production" ? "production" : "development";
}

/**
 * Checks the application, the database, the authentication configuration, and
 * the Realtime signing dependency. Every check reports only a name and a
 * status, so a health response is safe to expose without authentication and
 * cannot leak a connection string, a key, or a row.
 */
export async function checkHealth(
  db: Queryable,
  environment: Record<string, string | undefined> = process.env,
): Promise<HealthReport> {
  const checks: HealthCheck[] = [{ name: "application", status: "ok" }];

  try {
    await db.query("select 1");
    checks.push({ name: "database", status: "ok" });
  } catch {
    checks.push({ name: "database", status: "degraded" });
  }

  const authConfigured =
    (environment.BETTER_AUTH_SECRET ?? "").length >= 32 &&
    typeof environment.NEXT_PUBLIC_APP_URL === "string" &&
    environment.NEXT_PUBLIC_APP_URL.length > 0;
  checks.push({
    name: "authentication",
    status: authConfigured ? "ok" : "degraded",
  });

  // Realtime signs short-lived grants with the authentication secret, so its
  // availability follows the same configuration.
  checks.push({
    name: "realtime",
    status: authConfigured ? "ok" : "degraded",
  });

  return {
    checks,
    environment: environmentName(environment),
    status: checks.every((check) => check.status === "ok") ? "ok" : "degraded",
    time: new Date().toISOString(),
  };
}
