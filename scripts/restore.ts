import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import nextEnv from "@next/env";

const run = promisify(execFile);

/**
 * Restores a logical backup into a separate, non-production project.
 *
 * Replacing production data is a separate high-risk operation: it needs both
 * the explicit `--allow-production` acknowledgement and a maintenance window,
 * as the runbook describes.
 *
 * Usage:
 *   pnpm restore --artifact "<path to .dump>" --database-url "<target url>"
 *               [--allow-production]
 */
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  const environment = (
    await import("../src/config/environment")
  ).parseEnvironment(process.env);
  const { assertRestoreTarget, verifyChecksum } =
    await import("../src/server/operations/backup");

  const argv = process.argv.slice(2);
  const readArgument = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const artifact = readArgument("--artifact");
  const databaseUrl = readArgument("--database-url");
  const allowProduction = argv.includes("--allow-production");

  if (!artifact || !databaseUrl) {
    console.error(
      "Provide --artifact and --database-url. Restore into a new non-production project unless you have an incident plan.",
    );
    process.exitCode = 1;
    return;
  }

  assertRestoreTarget({
    allowProduction,
    databaseUrl,
    productionDatabaseUrl: environment.PRODUCTION_DATABASE_URL ?? null,
  });

  const bytes = new Uint8Array(await readFile(artifact));
  const metadata = JSON.parse(await readFile(`${artifact}.json`, "utf8")) as {
    sha256: string;
  };
  if (!verifyChecksum(bytes, metadata.sha256)) {
    console.error(
      "The artifact checksum does not match its metadata. Restore aborted before touching the target.",
    );
    process.exitCode = 1;
    return;
  }

  await run("pg_restore", [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--dbname",
    databaseUrl,
    artifact,
  ]);

  console.info(
    "Restore complete. Run the recovery verification checks before pointing any environment at the recovered project.",
  );
}

main().catch((error: unknown) => {
  console.error(
    `Restore failed: ${error instanceof Error ? error.message : "unknown failure"}`,
  );
  process.exitCode = 1;
});
