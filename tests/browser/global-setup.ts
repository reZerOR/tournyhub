/**
 * Playwright global setup: clear the IP-based rate limit rows accumulated by
 * the browser test suite's own loopback address before each run.  The
 * database tests use random IPs so they never contribute to this counter, but
 * re-running the browser suite within the same 60-second Better Auth rate
 * limit window would otherwise hit the OTP cap and cause spurious sign-in
 * failures.
 */
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());

export default async function globalSetup() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query(`DELETE FROM "rateLimit" WHERE key LIKE '127.0.0.1|%'`);
  } finally {
    await pool.end();
  }
}
