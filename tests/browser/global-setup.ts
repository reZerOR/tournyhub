/**
 * Playwright global setup: clear the IP-based rate limit rows accumulated by
 * the browser test suite's own loopback address before each run, and remove
 * the previous run's browser-test Users. Removing those Users cascades their
 * Auctions, which also clears any Live Auction left behind so the beta's
 * one-Live-Auction limit never blocks a fresh run.
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
    await pool.query(`DELETE FROM "user" WHERE email LIKE 'browser-%'`);
  } finally {
    await pool.end();
  }
}
