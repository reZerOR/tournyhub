import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Backup and restore support.
 *
 * The free Supabase plan's own backups may not match the product's recovery
 * needs, so TournyHub provides an operator-controlled logical backup that is
 * written outside the production project, recorded with enough metadata to
 * verify it, and never overwritten. Supabase Storage objects are listed
 * separately, because a database dump alone does not include them.
 *
 * The helpers here are pure so the process can be tested without a provider.
 */
export const BACKUP_TOOL_VERSION = "1.0.0";

export interface StorageManifestEntry {
  byteSize: number;
  contentType: string;
  key: string;
}

export interface BackupMetadata {
  applicationVersion: string;
  byteSize: number;
  createdAt: string;
  destination: string;
  environment: string;
  schemaVersion: string;
  sha256: string;
  storage: null | { checksum: string; count: number };
  toolVersion: string;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** `<timestamp>-<environment>-<schema>.dump`, so a listing sorts chronologically. */
export function backupFileName({
  createdAt,
  environment,
  schemaVersion,
}: {
  createdAt: Date;
  environment: string;
  schemaVersion: string;
}): string {
  const stamp = createdAt.toISOString().replace(/[:.]/g, "-");
  const safeEnvironment = environment.replace(/[^a-z0-9-]/gi, "") || "unknown";
  return `${stamp}-${safeEnvironment}-${schemaVersion}.dump`;
}

/**
 * A destination must be an absolute path outside the project directory, so a
 * backup can never be committed, served, or lost with the repository.
 */
export function validateBackupDestination(
  destination: string,
  projectDirectory: string,
): void {
  if (!path.isAbsolute(destination)) {
    throw new Error(
      "The backup destination must be an absolute path outside the project.",
    );
  }
  const relative = path.relative(projectDirectory, destination);
  if (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  ) {
    throw new Error(
      "The backup destination must be outside the project directory so it is never committed.",
    );
  }
}

/** A backup never overwrites an existing artifact. */
export function assertArtifactAbsent(
  destination: string,
  exists: boolean,
): void {
  if (exists) {
    throw new Error(
      `A backup already exists at ${path.basename(destination)}. Choose another destination or timestamp.`,
    );
  }
}

/** The separate Storage manifest summary, kept alongside the database artifact. */
export function summarizeStorageManifest(
  entries: readonly StorageManifestEntry[],
): { checksum: string; count: number } {
  const canonical = [...entries]
    .map((entry) => `${entry.key}:${entry.byteSize}:${entry.contentType}`)
    .sort()
    .join("\n");
  return {
    checksum: sha256Hex(new TextEncoder().encode(canonical)),
    count: entries.length,
  };
}

/** Verifies a downloaded artifact before it is used for a restore. */
export function verifyChecksum(bytes: Uint8Array, expected: string): boolean {
  return sha256Hex(bytes) === expected;
}

export function buildBackupMetadata(input: {
  applicationVersion: string;
  bytes: Uint8Array;
  createdAt: Date;
  destination: string;
  environment: string;
  schemaVersion: string;
  storage: null | { checksum: string; count: number };
}): BackupMetadata {
  return {
    applicationVersion: input.applicationVersion,
    byteSize: input.bytes.byteLength,
    createdAt: input.createdAt.toISOString(),
    destination: input.destination,
    environment: input.environment,
    schemaVersion: input.schemaVersion,
    sha256: sha256Hex(input.bytes),
    storage: input.storage,
    toolVersion: BACKUP_TOOL_VERSION,
  };
}

/**
 * A restore targets a new, separate non-production project by default.
 * Replacing production data is a separate high-risk operation that requires an
 * explicit acknowledgement, never an accidental default.
 */
export function assertRestoreTarget({
  allowProduction,
  databaseUrl,
  productionDatabaseUrl,
}: {
  allowProduction: boolean;
  databaseUrl: string;
  productionDatabaseUrl: null | string;
}): void {
  const isProduction =
    productionDatabaseUrl !== null && databaseUrl === productionDatabaseUrl;
  if (isProduction && !allowProduction) {
    throw new Error(
      "That connection string is the production database. Restore into a separate project, or pass the explicit production acknowledgement.",
    );
  }
}

/**
 * The verification a rehearsal must pass before a restore is considered good.
 * Each entry is a question the operator answers against the recovered project.
 */
export const RESTORE_VERIFICATION_CHECKS = [
  "Schema version matches the backup metadata.",
  "Critical row counts match the backup manifest.",
  "Auction, Team, Player, Sale, and Audit relationships hold.",
  "A representative can sign in and open an authorized snapshot.",
  "Results render for a completed Auction.",
  "Audit History is present and append-only.",
  "Supabase Storage objects match the copied manifest.",
] as const;

export interface RestoreVerification {
  failedChecks: string[];
  passed: boolean;
}

export function verifyRestore(
  results: readonly { id: string; ok: boolean }[],
): RestoreVerification {
  const failedChecks = results.filter((result) => !result.ok).map((r) => r.id);
  return { failedChecks, passed: failedChecks.length === 0 };
}
