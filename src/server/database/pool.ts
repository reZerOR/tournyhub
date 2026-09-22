import { Pool } from "pg";

import { serverEnv } from "@/config/server-env";

declare global {
  var __tournyhubPgPool: Pool | undefined;
}

import { normalizeConnectionString } from "./connection-string";

/**
 * Reused across hot reloads in development so `next dev` does not exhaust
 * Postgres connections by creating a new pool on every module reload.
 */
export function getPool(): Pool {
  globalThis.__tournyhubPgPool ??= new Pool({
    connectionString: normalizeConnectionString(serverEnv.DATABASE_URL),
  });
  return globalThis.__tournyhubPgPool;
}
