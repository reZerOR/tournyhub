import { readdir } from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

import {
  compareMigrations,
  readMigrationVersions,
} from "../src/server/operations/migrations";

/**
 * Compares the migration files with the applied history and exits non-zero on
 * drift, so a release cannot serve traffic against a schema it does not match.
 *
 * It reports versions only — never a connection string, a row, or a secret.
 */
async function main() {
  nextEnv.loadEnvConfig(process.cwd());

  const directory = path.join(process.cwd(), "supabase", "migrations");
  const files = readMigrationVersions(await readdir(directory));

  const { getPool } = await import("../src/server/database/pool");
  const pool = getPool();
  try {
    const applied = await pool.query<{ version: string }>(
      `select "version" from supabase_migrations.schema_migrations order by "version" asc`,
    );
    const report = compareMigrations(
      files,
      applied.rows.map((row) => row.version),
    );

    if (report.ok) {
      console.info(
        `Migration status is current: ${files.length} version(s) applied.`,
      );
      return;
    }

    console.error("Migration drift detected.");
    for (const version of report.missing) {
      console.error(`  not applied: ${version}`);
    }
    for (const version of report.extra) {
      console.error(`  applied but not in the repository: ${version}`);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    `Migration status failed: ${error instanceof Error ? error.message : "unknown failure"}`,
  );
  process.exitCode = 1;
});
