import { Pool } from "pg";

import { serverEnv } from "@/config/server-env";

declare global {
  var __tournyhubPgPool: Pool | undefined;
}

import { normalizeConnectionString } from "./connection-string";

/**
 * Reused across hot reloads in development so `next dev` does not exhaust
 * Postgres connections by creating a new pool on every module reload.
 *
 * `DATABASE_URL` must be the shared transaction pooler (port 6543). The session
 * pooler pins one backend per client and is capped at the project's Pool Size,
 * which serverless exhausts: many concurrent Function instances each open their
 * own application-side pool. The bounds below keep one instance's share small
 * enough that every instance still fits inside the pooler's client budget.
 */
export function getPool(): Pool {
  globalThis.__tournyhubPgPool ??= new Pool({
    connectionString: normalizeConnectionString(serverEnv.DATABASE_URL),
    max: 3,
    idleTimeoutMillis: 10_000,
    // Fail fast. A starved request must surface as an error the console can
    // retry, not as a stall that outlives the client's staleness window.
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });
  return globalThis.__tournyhubPgPool;
}
