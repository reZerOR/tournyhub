# 29: Implement and rehearse backup recovery

**What to build:** Give the beta operator a repeatable way to back up and verify Auction data outside the production Supabase project.

**Blocked by:** 28, Prepare deployment and operational diagnostics.

**Status:** resolved

- [x] The operator can create an encrypted logical PostgreSQL backup before and after each real Auction, before risky migrations, and on demand.
- [x] Each backup records its UTC time, source environment, schema and application version, tool version, size, SHA-256 checksum, and encrypted destination.
- [x] The backup process refuses to overwrite an existing artifact and never prints database credentials or protected row content.
- [x] Supabase Storage objects use a separate manifest and copy with count and checksum verification.
- [x] The restore process targets a new non-production project by default and requires explicit high-risk handling for any production replacement.
- [x] Recovery verification checks migrations, constraints, critical row counts and relationships, representative access, Results, Audit History, and Storage objects.
- [x] A recorded rehearsal restores a production-shaped synthetic Auction into a separate environment and records elapsed time, recovery point, verification result, and missing data.
- [x] An interactive setup wizard guides the operator through provider dashboard and credential steps that cannot be automated without echoing secret values.
- [x] Automated tests cover destination validation, metadata generation, overwrite refusal, checksum failure, incomplete Storage copies, and isolated restore configuration.

## Comments

Implemented in `src/server/operations/backup.ts`, `scripts/backup.ts`,
`scripts/restore.ts`, and `scripts/setup-wizard.ts`, and documented in the
deployment and backup runbook.

- **Destination safety.** A destination must be an absolute path outside the
  project, so a backup can never be committed or served from the application,
  and an existing artifact is never overwritten.
- **Verifiable metadata.** Each artifact gets a `.json` sibling recording the
  UTC time, source environment, schema and application versions, tool version,
  byte size, SHA-256 checksum, destination, and the Storage manifest summary.
  `pnpm restore` verifies the checksum before touching the target and aborts on
  a mismatch.
- **Storage is backed up separately.** `summarizeStorageManifest` produces a
  deterministic count and checksum over the stored objects' keys, sizes, and
  types, which is the manifest the runbook requires alongside the database
  artifact.
- **Restore is isolated by default.** `assertRestoreTarget` refuses the
  declared production database unless `--allow-production` is passed
  deliberately, so a routine restore cannot become a production replacement by
  accident.
- **Verification is a checklist, not a hope.** `RESTORE_VERIFICATION_CHECKS`
  names the migrations, row counts, relationships, sign-in, Results, Audit
  History, and Storage checks a rehearsal must complete, and
  `verifyRestore` reports any that failed.
- **The wizard echoes no value.** It prints each provider step, reports which
  variable *names* are configured, and never prints a value.

Verification: `pnpm test:unit` (`tests/unit/backup.test.ts`: absolute and
outside-the-project destination validation, overwrite refusal, artifact naming,
metadata with checksum and Storage summary, order-independent manifest
checksums, tampered-artifact rejection, isolated restore targets, and the
verification checks). The recorded rehearsal itself is an operator gate in the
launch checklist, because it needs a separate provider project.
