/**
 * Migration status for a release.
 *
 * A release must never run against a database whose schema does not match the
 * migration files it ships. These helpers are pure, so a deployment script can
 * compare the files with the applied history and fail on drift before serving
 * traffic.
 */
export interface MigrationFile {
  /** The version prefix of the file name, e.g. `20260922100000`. */
  version: string;
}

export interface DriftReport {
  /** Versions applied in the database but absent from the repository. */
  extra: string[];
  /** Versions present in the repository but not applied. */
  missing: string[];
  ok: boolean;
}

/** The version of a Supabase-style migration file name. */
export function parseMigrationVersion(fileName: string): null | string {
  const match = /^(\d{14})_.+\.sql$/.exec(fileName.trim());
  return match ? match[1]! : null;
}

/** Every migration version in a directory listing, sorted ascending. */
export function readMigrationVersions(fileNames: readonly string[]): string[] {
  return fileNames
    .map(parseMigrationVersion)
    .filter((version): version is string => version !== null)
    .sort();
}

export function compareMigrations(
  files: readonly string[],
  applied: readonly string[],
): DriftReport {
  const fileSet = new Set(files);
  const appliedSet = new Set(applied);
  const missing = [...fileSet].filter((version) => !appliedSet.has(version));
  const extra = [...appliedSet].filter((version) => !fileSet.has(version));

  return {
    extra: extra.sort(),
    missing: missing.sort(),
    ok: missing.length === 0 && extra.length === 0,
  };
}

/**
 * The order a release should follow when a migration is not backward
 * compatible: deploy the compatible application code, apply the migration, then
 * deploy the code that depends on it.
 */
export const MIGRATION_RELEASE_ORDER = [
  "1. Confirm types, lint, unit, integration, browser, and applicable load tests pass.",
  "2. Review pending migrations for locks, destructive changes, and defaults.",
  "3. Take a fresh backup before any migration that can alter Auction data.",
  "4. Deploy backward-compatible code first, then apply migrations, then deploy dependent code.",
  "5. Run the migration status check and fail the release on drift.",
  "6. Smoke test with synthetic accounts and a Draft Auction.",
] as const;
