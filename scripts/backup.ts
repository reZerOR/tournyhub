import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import nextEnv from "@next/env";

const run = promisify(execFile);

/**
 * Creates a logical PostgreSQL backup outside the production project, with a
 * separate manifest of the Supabase Storage objects and a metadata file beside
 * the artifact.
 *
 * The script refuses to overwrite an artifact, never prints a credential or a
 * row, and writes its metadata beside the artifact so a restore can verify it.
 *
 * Usage:
 *   pnpm backup --destination "<absolute path outside the project>"
 *
 * `pg_dump` must be on PATH; the runbook records the tool version to use.
 */
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  const { parseEnvironment } = await import("../src/config/environment");
  const environment = parseEnvironment(process.env);

  const { getPool } = await import("../src/server/database/pool");
  const {
    assertArtifactAbsent,
    backupFileName,
    buildBackupMetadata,
    summarizeStorageManifest,
    validateBackupDestination,
  } = await import("../src/server/operations/backup");

  const argv = process.argv.slice(2);
  const destinationIndex = argv.indexOf("--destination");
  const destination =
    destinationIndex >= 0 ? argv[destinationIndex + 1] : undefined;
  if (!destination) {
    console.error(
      'Provide --destination "<absolute path outside the project>", for example --destination "D:\\tournyhub-backups".',
    );
    process.exitCode = 1;
    return;
  }
  validateBackupDestination(destination, process.cwd());

  const pool = getPool();
  try {
    const schemaResult = await pool.query<{ version: string }>(
      `select "version" from supabase_migrations.schema_migrations
        order by "version" desc limit 1`,
    );
    const schemaVersion = schemaResult.rows[0]?.version ?? "unknown";
    const environmentName = environment.APP_ENVIRONMENT ?? "development";
    const createdAt = new Date();
    const artifactPath = path.join(
      destination,
      backupFileName({
        createdAt,
        environment: environmentName,
        schemaVersion,
      }),
    );
    assertArtifactAbsent(artifactPath, await exists(artifactPath));

    // The dump goes straight to the destination; the connection string only
    // ever exists in this process's environment.
    await run("pg_dump", [
      "--no-owner",
      "--no-privileges",
      "--format=custom",
      "--file",
      artifactPath,
      environment.DATABASE_URL,
    ]);

    const bytes = new Uint8Array(await readFile(artifactPath));
    const storageEntries = await pool.query<{
      byte_size: number;
      content_type: string;
      key: string;
    }>(
      `select "key", "byte_size", "content_type" from "stored_object"
        order by "key" asc`,
    );
    const metadata = buildBackupMetadata({
      applicationVersion: process.env.npm_package_version ?? "0.1.0",
      bytes,
      createdAt,
      destination: artifactPath,
      environment: environmentName,
      schemaVersion,
      storage: summarizeStorageManifest(
        storageEntries.rows.map((row) => ({
          byteSize: row.byte_size,
          contentType: row.content_type,
          key: row.key,
        })),
      ),
    });
    await writeFile(
      `${artifactPath}.json`,
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    );

    console.info(
      `Backup complete: ${metadata.byteSize} bytes, sha256 ${metadata.sha256.slice(0, 12)}…, ${metadata.storage?.count ?? 0} stored object(s).`,
    );
  } finally {
    await pool.end();
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  console.error(
    `Backup failed: ${error instanceof Error ? error.message : "unknown failure"}`,
  );
  process.exitCode = 1;
});
