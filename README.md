# TournyHub

TournyHub is a private, non-commercial beta for live player Auctions. This repository contains the application foundation, passwordless email and Google authentication, User preferences, session controls, and a protected application shell. Auction behavior belongs to later dependency-gated tickets.

## Requirements

- Node.js 24, as pinned in `.node-version`
- pnpm 10.33.0, as pinned in `package.json`
- A Docker-compatible container runtime for the local Supabase PostgreSQL service

## Start the application

Install the pinned dependencies from a clean checkout:

```bash
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env.local`, then replace the local placeholders. Validate the file and start Next.js:

```bash
pnpm env:check
pnpm dev
```

The application runs at `http://localhost:3000`. `pnpm build` creates a production build and `pnpm start` serves that build.

## Environment

The startup validator requires these variables:

| Variable                               | Purpose                                                                    | Exposure     |
| -------------------------------------- | -------------------------------------------------------------------------- | ------------ |
| `NEXT_PUBLIC_APP_URL`                  | Canonical application URL                                                  | Browser-safe |
| `DATABASE_URL`                         | PostgreSQL connection used by server modules and database tests            | Server-only  |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project API URL                                                   | Browser-safe |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase browser client key                                                | Browser-safe |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`        | Live Broadcast key; use a legacy anon JWT if the REST endpoint returns 401 | Browser-safe |
| `SUPABASE_SERVICE_ROLE_KEY`            | Privileged Supabase server access                                          | Server-only  |
| `BETTER_AUTH_SECRET`                   | High-entropy secret Better Auth uses to sign sessions                      | Server-only  |

Set `APP_ENVIRONMENT` to `development`, `preview`, or `production`, and declare
`PRODUCTION_DATABASE_URL` in every environment. A Preview deployment that points
at the production database is rejected at startup, and so is a Preview
deployment holding `PLATFORM_ADMIN_BOOTSTRAP_EMAIL`.

Validation reports variable names and corrective steps without printing configured values. The checked-in example contains local placeholders, not production credentials.

`EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD` are optional. Without them, sign-in emails are written to the gitignored `.dev-emails/` directory instead of being sent, which is sufficient for local development.

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are optional as a pair for email-only local development. Set both to enable Google sign-in, and register `<NEXT_PUBLIC_APP_URL>/api/auth/callback/google` as an authorized redirect URI in Google Cloud.

## Local database

The Supabase CLI configuration lives in `supabase/`. A container runtime must be running before these commands:

```bash
pnpm db:start
pnpm db:migrate
pnpm db:status
```

`pnpm db:migrate` applies pending versioned migrations. `pnpm db:status` compares the migration files with the local migration history. The baseline migration records the starting schema without adding domain tables.

Use `pnpm db:stop` when finished. `pnpm db:reset` recreates the local database and reapplies every migration, so use it only for disposable development data.

## Quality commands

| Command             | Check                                              |
| ------------------- | -------------------------------------------------- |
| `pnpm format`       | Write Prettier formatting                          |
| `pnpm format:check` | Verify formatting                                  |
| `pnpm lint`         | Run ESLint with no warnings                        |
| `pnpm typecheck`    | Run the TypeScript compiler without emitting files |
| `pnpm test:unit`    | Run Vitest unit tests                              |
| `pnpm test:db`      | Run database tests against `DATABASE_URL`          |
| `pnpm test:browser` | Run Playwright in Chromium                         |
| `pnpm check`        | Run the complete local validation sequence         |

## Operations

| Command                | Purpose                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `pnpm migrate:status`  | Compare migration files with the applied history and fail on drift        |
| `pnpm admin:bootstrap` | Provision the first Platform Administrator, once                          |
| `pnpm backup`          | Create a backup, its metadata, and a Storage manifest outside the project |
| `pnpm restore`         | Restore an artifact into a separate non-production project                |
| `pnpm setup:wizard`    | Walk through the provider steps that cannot be automated                  |
| `pnpm rehearsal:bid`   | Measure committed Bid latency for the capacity gate                       |
| `pnpm launch:gates`    | Run the automated gates and report the operator gates                     |

`GET /api/health` reports the application, database, authentication, and
Realtime dependencies as names and statuses only, so it is safe to call without
authentication. Every response carries a Content Security Policy, framing,
MIME-sniffing, referrer, and permissions policy.

## Beta limits

The beta allows one Live Auction at a time, recommends 16 Teams and supports at
most 32, caps an Auction at 2,000 Player Entries, and caps connected browser
tabs at 40. It is a personal, non-commercial beta with no availability SLA. See
[the beta launch checklist](docs/beta-launch-checklist.md).

Install the browser once, start and migrate the local database, then run all checks:

```bash
pnpm exec playwright install chromium
pnpm db:start
pnpm db:migrate
pnpm check
pnpm db:stop
```

Continuous integration performs the same sequence from a clean environment.

## Source modules

The initial directories reserve the module ownership defined in `docs/architecture.md`:

| Path                           | Module                                              |
| ------------------------------ | --------------------------------------------------- |
| `src/server/auth/`             | Better Auth, sessions, account security, OTP limits |
| `src/features/identity/`       | Sign-in, User settings, sessions, and invitations   |
| `src/features/auctions/setup/` | Auction Setup and Draft workflow                    |
| `src/server/auction-command/`  | Authoritative fairness-affecting commands           |
| `src/server/auction-query/`    | Authorized snapshots and read models                |
| `src/server/realtime/`         | Committed revision distribution and private access  |
| `src/server/import-export/`    | Player imports and Auction Results exports          |
| `src/features/administration/` | Platform Administration interface                   |
| `src/domain/`                  | Shared domain types without framework code          |

The Auction Command module remains the primary domain and testing seam for the Auction behavior implemented in later tickets.
