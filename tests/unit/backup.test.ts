import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertArtifactAbsent,
  assertRestoreTarget,
  BACKUP_TOOL_VERSION,
  backupFileName,
  buildBackupMetadata,
  RESTORE_VERIFICATION_CHECKS,
  sha256Hex,
  summarizeStorageManifest,
  validateBackupDestination,
  verifyChecksum,
  verifyRestore,
} from "@/server/operations/backup";

const PROJECT = path.join("E:", "projects", "TournyHub");

describe("backup destination", () => {
  it("accepts an absolute path outside the project", () => {
    expect(() =>
      validateBackupDestination(path.join("D:", "tournyhub-backups"), PROJECT),
    ).not.toThrow();
  });

  it("refuses a relative path and any path inside the project", () => {
    expect(() => validateBackupDestination("backups", PROJECT)).toThrow(
      /absolute path/,
    );
    expect(() =>
      validateBackupDestination(path.join(PROJECT, "backups"), PROJECT),
    ).toThrow(/outside the project/);
    expect(() => validateBackupDestination(PROJECT, PROJECT)).toThrow();
  });

  it("refuses to overwrite an existing artifact", () => {
    expect(() =>
      assertArtifactAbsent(path.join("D:", "a.dump"), false),
    ).not.toThrow();
    expect(() => assertArtifactAbsent(path.join("D:", "a.dump"), true)).toThrow(
      /already exists/,
    );
  });
});

describe("backup metadata", () => {
  const bytes = new TextEncoder().encode("dump-bytes");
  const createdAt = new Date("2026-09-20T10:00:00.000Z");

  it("names the artifact by time, environment, and schema version", () => {
    expect(
      backupFileName({
        createdAt,
        environment: "production",
        schemaVersion: "20260922130000",
      }),
    ).toBe("2026-09-20T10-00-00-000Z-production-20260922130000.dump");
    expect(
      backupFileName({ createdAt, environment: "", schemaVersion: "x" }),
    ).toContain("unknown");
  });

  it("records size, checksum, versions, and the storage manifest", () => {
    const metadata = buildBackupMetadata({
      applicationVersion: "0.1.0",
      bytes,
      createdAt,
      destination: path.join("D:", "backups", "a.dump"),
      environment: "development",
      schemaVersion: "20260922130000",
      storage: summarizeStorageManifest([
        { byteSize: 10, contentType: "image/png", key: "a/1.png" },
        { byteSize: 20, contentType: "image/png", key: "b/2.png" },
      ]),
    });

    expect(metadata.byteSize).toBe(bytes.byteLength);
    expect(metadata.sha256).toBe(sha256Hex(bytes));
    expect(metadata.toolVersion).toBe(BACKUP_TOOL_VERSION);
    expect(metadata.storage).toMatchObject({ count: 2 });
    expect(metadata.storage?.checksum).toHaveLength(64);
  });

  it("fails verification when a byte changes", () => {
    const checksum = sha256Hex(bytes);
    expect(verifyChecksum(bytes, checksum)).toBe(true);
    const tampered = new TextEncoder().encode("dump-bytes!");
    expect(verifyChecksum(tampered, checksum)).toBe(false);
  });

  it("summarizes the Storage manifest deterministically, ignoring order", () => {
    const entries = [
      { byteSize: 10, contentType: "image/png", key: "a/1.png" },
      { byteSize: 20, contentType: "image/png", key: "b/2.png" },
    ];
    expect(summarizeStorageManifest(entries)).toEqual(
      summarizeStorageManifest([...entries].reverse()),
    );
    expect(summarizeStorageManifest([])).toMatchObject({ count: 0 });
  });
});

describe("restore target", () => {
  const production = "postgresql://prod@example.com/postgres";

  it("refuses production unless it is explicitly acknowledged", () => {
    expect(() =>
      assertRestoreTarget({
        allowProduction: false,
        databaseUrl: production,
        productionDatabaseUrl: production,
      }),
    ).toThrow(/production database/);
  });

  it("allows a separate project, and production with the acknowledgement", () => {
    expect(() =>
      assertRestoreTarget({
        allowProduction: false,
        databaseUrl: "postgresql://recovery@example.com/postgres",
        productionDatabaseUrl: production,
      }),
    ).not.toThrow();
    expect(() =>
      assertRestoreTarget({
        allowProduction: true,
        databaseUrl: production,
        productionDatabaseUrl: production,
      }),
    ).not.toThrow();
  });

  it("lists the verification checks and reports failures", () => {
    expect(RESTORE_VERIFICATION_CHECKS.length).toBeGreaterThan(4);
    expect(
      verifyRestore([
        { id: "schema", ok: true },
        { id: "rows", ok: false },
      ]),
    ).toEqual({ failedChecks: ["rows"], passed: false });
    expect(verifyRestore([{ id: "schema", ok: true }])).toEqual({
      failedChecks: [],
      passed: true,
    });
  });
});
