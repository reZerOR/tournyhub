import { spawnSync } from "node:child_process";

import nextEnv from "@next/env";

/**
 * Applies the repository's pending migrations to the production database.
 *
 * Deliberately manual, and outside CI: nothing in the pipeline touches
 * production, so a release cannot migrate it by accident. It connects over the
 * direct connection in `PRODUCTION_DATABASE_URL`, never the transaction pooler,
 * because the Supabase CLI needs a session-scoped connection for DDL.
 *
 * The connection string is passed as a literal argument rather than through a
 * shell, so a password containing shell metacharacters cannot be mangled. It is
 * never printed.
 */
async function main() {
  nextEnv.loadEnvConfig(process.cwd());

  const url = process.env.PRODUCTION_DATABASE_URL;
  if (!url) {
    throw new Error(
      "PRODUCTION_DATABASE_URL is not set. It must be the direct connection " +
        "string (percent-encoded), not the transaction pooler.",
    );
  }
  if (url.includes(":6543")) {
    throw new Error(
      "PRODUCTION_DATABASE_URL is the transaction pooler (port 6543). Run " +
        "migrations over the direct connection (port 5432) instead.",
    );
  }

  const result = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "supabase", "db", "push", "--yes", "--db-url", url],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

main().catch((error: unknown) => {
  console.error(
    `Migration push failed: ${error instanceof Error ? error.message : "unknown failure"}`,
  );
  process.exitCode = 1;
});
