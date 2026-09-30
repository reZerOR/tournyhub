# 02 — Bound the database pool

Status: resolved
Type: backend
Blocked by: 01

## Answer

`getPool()` in `src/server/database/pool.ts` now sets explicit bounds —
`max: 3`, `idleTimeoutMillis: 10_000`, `connectionTimeoutMillis: 5_000`,
`allowExitOnIdle: true` — with a comment recording that `DATABASE_URL` must be
the transaction pooler.

`max` is **3, not 1**, deviating from the plan: until ticket 08 lands a command
still spends ~22 sequential round trips inside the row lock, and `settle()`'s
~20-query snapshot shares the same pool, so a single connection would serialise
them and add latency. Three per instance still leaves the whole fleet far inside
the pooler's client budget (the free plan allows ~200 pooler clients). The
fail-fast `connectionTimeoutMillis` is the part that matters most: a starved
request now surfaces as an error the console can retry instead of a stall that
outlives the staleness window.

`.env.example` documents the transaction-pooler requirement and the direct
connection kept for backup, restore and migration scripts.

Verified: `pnpm typecheck`, `pnpm lint` and `pnpm test:unit` (235 tests) pass;
the changed files are Prettier-clean.

## Goal

Give the single application pool explicit, deliberately small bounds so one Function instance can never demand ten Postgres backends.

## File: `src/server/database/pool.ts`

`getPool()` is currently:

```ts
new Pool({ connectionString: normalizeConnectionString(serverEnv.DATABASE_URL) })
```

Add explicit options:

```ts
new Pool({
  connectionString: normalizeConnectionString(serverEnv.DATABASE_URL),
  // One connection per warm instance is Supabase's guidance for Vercel
  // Functions on the transaction pooler. Raise only with evidence of queuing.
  max: 1,
  idleTimeoutMillis: 10_000,
  // Fail fast instead of letting a request hang for minutes: a starved
  // request must surface as an error the console can retry, not as a stall.
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: true,
})
```

Keep the `globalThis.__tournyhubPgPool` reuse so hot reloads do not multiply pools.

## File: `src/server/database/connection-string.ts`

No change. The SSL normalisation still applies to the pooler host; transaction mode also requires SSL.

## File: `.env.example`

Add a comment making the pooler requirement explicit, without any real value:

```
# Use Supabase's transaction pooler (port 6543) for the runtime connection.
# The session pooler (5432) pins a backend per client and is capped at the
# project's Pool Size, which serverless exhausts. Keep a direct connection in
# PRODUCTION_DATABASE_URL for backup, restore and migration scripts.
```

## Done when

`pool.ts` sets `max`, `idleTimeoutMillis`, `connectionTimeoutMillis` and `allowExitOnIdle` explicitly; `pnpm typecheck`, `pnpm lint` and `pnpm test:unit` pass; `.env.example` documents the pooler requirement.
