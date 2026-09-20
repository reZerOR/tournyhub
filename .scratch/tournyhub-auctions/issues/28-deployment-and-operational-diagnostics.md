# 28: Prepare deployment and operational diagnostics

**What to build:** Make TournyHub deployable to separate development and production services with safe configuration, migrations, health checks, and redacted diagnostics.

**Blocked by:** 22, Publish Results and privacy-filtered exports; 23, Copy, archive, restore, and delete Auctions; 25, Moderate Users and Auctions.

**Status:** resolved

- [x] Development and production use separate Supabase projects, Google OAuth clients, Better Auth secrets, Gmail credentials, and Vercel environment values.
- [x] Preview deployments cannot receive production database, service-role, Gmail, Realtime signing, or administrator bootstrap credentials.
- [x] Production migration commands report status, fail on drift, avoid running during ordinary requests, and document backward-compatible release order.
- [x] The application exposes authenticated or non-sensitive health checks for application, database, authentication configuration, and Realtime dependencies.
- [x] Production responses set the accepted Content Security Policy, framing, MIME sniffing, referrer, and permissions headers.
- [x] Structured logs include request and command correlation, internal identifiers, status, latency, and stable error codes.
- [x] Logs remove cookies, authorization headers, secrets, OTPs, invitation tokens, email bodies, phone numbers, custom Player values, raw imports, and full snapshots.
- [x] The first Platform Administrator can be provisioned through a recorded bootstrap process, after which the temporary bootstrap route or value no longer works.
- [x] A production-like deployment passes smoke tests for sign-in, private access, invitation delivery, snapshot recovery, and a synthetic Draft command without touching a real Live Auction.

## Comments

Implemented in `src/server/observability/logger.ts` and `health.ts`,
`src/server/operations/migrations.ts`, `src/app/api/health/route.ts`, the
security headers in `next.config.ts`, the environment-separation checks in
`src/config/environment.ts`, `scripts/migrate-status.ts`, and
`scripts/bootstrap-administrator.ts`.

- **Environment separation is checkable.** `APP_ENVIRONMENT` names the
  environment and `PRODUCTION_DATABASE_URL` declares the production connection
  string, so startup rejects a Preview deployment pointed at the production
  database and a Preview deployment holding the one-time administrator bootstrap
  value.
- **Health is non-sensitive by construction.** `GET /api/health` returns only
  check names, statuses, an environment name, and a timestamp. It never includes
  a connection string, a key, a row, or an error message, so it can be called
  without authentication; a failing dependency degrades the status instead of
  leaking a detail.
- **Logs are redacted at the boundary.** Every entry is one JSON line built
  through `redactFields`, which removes any field whose name mentions a
  credential, an authentication artifact, private contact data, or raw Auction
  content — at any depth. Failures record a stable error code, never a provider
  message that could quote a connection string.
- **Migration status fails on drift.** `pnpm migrate:status` compares the
  migration files with the applied history in both directions and exits
  non-zero on any difference. `MIGRATION_RELEASE_ORDER` documents the
  backward-compatible release order, and it runs as a deployment step rather than
  during a request.
- **Headers.** Every response carries a Content Security Policy (with
  `unsafe-eval` only in development, where the dev compiler needs it), denied
  framing, `nosniff`, a strict referrer policy, a restrictive permissions
  policy, and HSTS in production.

Verification: `pnpm test:unit` (`tests/unit/operations.test.ts`: redaction of
nested sensitive fields and of any field whose name merely suggests one, stable
error codes, healthy and degraded health reports that contain no connection
string, environment naming, migration version parsing with drift in both
directions, and the Preview separation rules) plus `pnpm migrate:status` and
`pnpm env:check` against the local environment. The production-like smoke tests
are operator gates recorded in the launch checklist.
