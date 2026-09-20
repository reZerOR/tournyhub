# Deployment and backup runbook

Status: Confirmed

This runbook describes the intended operator process. Exact dashboard labels and
commands should be verified against current provider documentation when those
scripts are built.

## Implemented tooling

The application supplies the scripts this runbook refers to:

| Step | Command |
| --- | --- |
| Interactive provider setup | `pnpm setup:wizard` |
| Environment validation | `pnpm env:check` |
| Migration status, failing on drift | `pnpm migrate:status` |
| Logical backup, metadata, Storage manifest | `pnpm backup --destination "<absolute path outside the project>"` |
| Restore into a separate project | `pnpm restore --artifact "<artifact>" --database-url "<target>"` |
| First Platform Administrator, once | `pnpm admin:bootstrap` |
| Health check | `GET /api/health` |
| Bid latency rehearsal | `pnpm rehearsal:bid -- --teams 16 --tabs 40` |
| Launch gates | `pnpm launch:gates` |

`pnpm backup` writes the artifact, its `.json` metadata, and the Storage
manifest summary; it refuses to overwrite an artifact and never prints a
credential. `pnpm restore` verifies the artifact checksum before touching the
target and refuses the production database unless `--allow-production` is
passed deliberately. Bootstrap refuses to run once any administrator exists, so
`PLATFORM_ADMIN_BOOTSTRAP_EMAIL` must be removed after the first use.


## Service inventory

| Service | Beta purpose | Boundary |
| --- | --- | --- |
| Vercel Hobby | Next.js build, server routes, and deployment | Personal, non-commercial beta only |
| Supabase Free | PostgreSQL, Realtime, and optional Team-logo storage | One development project and one production project |
| Better Auth | Application authentication and sessions in PostgreSQL | Configured inside the application |
| Google OAuth | Google sign-in | Separate development and production redirects |
| Gmail with Nodemailer | Email OTP and invitation delivery | Low-volume beta delivery only |

If usage or commercial operation exceeds free-plan terms or capacity, pause expansion and select paid services. Do not bypass provider limits by silently creating a fragmented production system.

## Environment separation

Use separate Supabase projects for development and production. Local development may use a local database where supported. Vercel Preview deployments use development or isolated preview data and can never hold production service-role credentials.

Environment variables include, at minimum:

- Application base URL and trusted origins
- Better Auth secret and database connection
- Google OAuth client ID and secret
- Gmail SMTP identity and app credential
- Supabase project URL, publishable key, and server-only service credential
- Realtime signing or channel configuration required by the chosen broker design
- Platform Administrator allowlist/bootstrap value used only for initial provisioning

Maintain an example environment file containing names and safe descriptions, never real values.

## Initial provisioning

1. Create development and production Supabase projects in a region suitable for Bangladesh-based use and the selected Vercel region.
2. Create the Vercel project and connect the source repository.
3. Configure development, preview, and production variables with the separation rules above.
4. Create Google OAuth clients with exact local, preview where intentionally supported, and production callback URLs.
5. Configure the Gmail sender and verify delivery to multiple providers without logging OTP content.
6. Apply database migrations to development, seed only synthetic data, and run all checks.
7. Apply migrations to production through the migration command, not by ad hoc dashboard edits.
8. Create the first Platform Administrator using the audited bootstrap process and remove any temporary bootstrap override.
9. Deploy production, run the smoke suite, and verify security headers, redirects, sign-in, private access, Realtime reconnect, and command health.

## Deployment procedure

For every production release:

1. Confirm the change has passed types, lint, unit, integration, browser, and applicable load tests.
2. Review pending migrations for locks, destructive changes, default values, and backward compatibility.
3. Take a fresh application backup before any migration that can alter existing Auction data.
4. Deploy backward-compatible application code or migrations in the order documented by the change.
5. Run the migration status check and fail on drift.
6. Run smoke tests against production using synthetic accounts and a Draft Auction.
7. Confirm authentication delivery, database health, private Realtime subscription, snapshot reads, and a synthetic command path.
8. Record release version, migration version, operator, timestamp, and smoke result.

Never test a live mutation against a real active Auction. During the beta, schedule risky releases away from planned Auctions.

## Rollback

Application rollback may use the last known-good Vercel deployment only when its code is compatible with the current database schema. Database migrations are forward-fixed by default. A destructive database restore is an incident action, not a routine rollback.

If a release threatens Auction integrity:

1. Prevent new Auctions from starting and pause the active Auction if the existing safe application path permits it.
2. Preserve logs and record the current Auction revision and provider status.
3. Roll back compatible application code or deploy a forward fix.
4. Do not edit Bids or Sales manually. Use documented compensating domain commands after recovery.
5. Notify affected Organizers and representatives through an external contact channel if application messaging is unavailable.

## Application backups

Supabase Free backup guarantees may not match the product's recovery needs, so TournyHub must provide an operator-controlled backup process.

Create a logical PostgreSQL backup:

- Before and after every real Auction
- Before risky migrations
- At least monthly while retained Auctions exist

Backups must be encrypted at rest, stored outside the production Supabase project, named with UTC timestamp and schema/application version, and accessible only to the operator. Do not commit them or place them in public file shares.

Supabase Storage objects require a separate manifest and object copy. The database backup alone is not a complete backup of Team logos or stored exports.

For each backup, record:

- UTC creation time
- Source environment and database identifier
- Schema migration version
- Tool version and command outcome
- File size and SHA-256 checksum
- Storage manifest count/checksum when applicable
- Encrypted destination

The future `pnpm backup` script should validate the destination, produce the logical database artifact and metadata, and refuse to overwrite an existing artifact. It must not print connection credentials.

## Restore rehearsal and recovery

Restore only into a newly created, separate non-production Supabase project until the result is verified.

1. Confirm the chosen artifact checksum and encryption access.
2. Create an empty recovery project and storage bucket with no production callbacks.
3. Restore the database with the documented tool version.
4. Restore storage objects from their manifest.
5. Run migration/version, constraint, row-count, and critical relationship checks.
6. Point an isolated application deployment at the recovery project.
7. Verify sign-in with test identities, authorized snapshot reads, Results, Audit History, and representative/Roster relationships.
8. Record recovery point, elapsed time, verification result, and any missing data.

Promoting recovered data into production is a separate high-risk procedure that requires a written incident plan and a maintenance window.

## Before a real Auction

- Confirm no other Auction is Live.
- Review Vercel, Supabase, Google, and Gmail service status and quota headroom.
- Confirm the current production version and migrations passed smoke tests.
- Produce and verify a recent backup.
- Run the Auction's Readiness check and retain its successful revision.
- Confirm every representative can sign in and complete a practice Bid.
- Confirm the Organizer knows pause, resume, correction, and external-contact procedures.
- Close unused test tabs and keep total expected tabs at or below 40.

## During an incident

Prioritize integrity over continuity. The Organizer pauses the Auction when possible. Capture UTC time, Auction ID, current revision, observed behavior, affected Users, and provider status without copying phone numbers or OTP/session data into the incident note.

- Authentication outage: keep the Auction paused; do not replace identity checks with shared credentials.
- Realtime outage: clients refetch snapshots; if current state cannot be verified promptly, pause.
- Database or command outage: do not accept offline Bids. Pause and resume only after authoritative health returns.
- Email outage: existing sessions may continue; do not manually disclose OTPs or invitation tokens.
- Suspected account compromise: revoke sessions, suspend when warranted, replace the representative while paused, and audit the action.
- Suspected integrity defect: cancel or reverse only through supported commands; preserve all history.

## After a real Auction

Complete and verify Results, create the post-event backup, verify its checksum and external storage, export required Results through the application, and review unusual rejections or correction Audit Entries. Do not retain ad hoc copies of Player phone numbers beyond the organizer's legitimate need.

## Human-only setup support

Once the application scripts exist, provide an interactive setup wizard for dashboard and credential steps that cannot be automated. It should point to exact provider fields, validate entered environment-variable names without echoing secret values, and end with automated connection and redirect checks.
