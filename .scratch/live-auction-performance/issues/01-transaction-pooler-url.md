# 01 — Set the transaction-pooler `DATABASE_URL`

Status: resolved
Type: ops

## Answer

Reported done by the repository owner. Verified as far as the Vercel API allows:
`DATABASE_URL` exists on both **production** and **preview**, and its
`updatedAt` (1790098352008) is later than its `createdAt` (1790096391112), so it
was edited after the project was created. The value is stored `sensitive` and is
not readable through the API, so the literal `:6543` cannot be asserted from
here — ticket 09's rehearsal against a production-like target is what proves the
transaction pooler is actually in the command path.

## Goal

Point the runtime `DATABASE_URL` at Supabase's **shared transaction pooler (port 6543)** instead of the **session-mode pooler (port 5432)**.

## Why

In session mode one client connection pins one Postgres backend for its whole life, and the project is capped at `pool_size: 15` for the `postgres` role — project-wide, not per instance. `getPool()` sets no `max`, so node-postgres asks for up to 10 per process, and Vercel runs several Function instances at once. That is the cause of the ~4,900 `(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15` and 913 `Failed to get session` errors in the production runtime logs. Transaction mode multiplexes many clients onto few backends, which is Supabase's documented recipe for Vercel Functions.

## Steps

1. In the Supabase dashboard, open **Project Settings → Database → Connection string** and copy the **Transaction pooler** string. It looks like:
   ```
   postgresql://postgres.kscfkczaguadstdifuhr:<password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```
   Confirm `6543` (transaction) and **not** `5432` (session).
2. Set it as `DATABASE_URL` in **Vercel → Project `tournyhub` → Settings → Environment Variables**, for **Production** and **Preview**.
   - Preview must not equal `PRODUCTION_DATABASE_URL`; `src/config/environment.ts` refuses that combination on `APP_ENVIRONMENT=preview`.
   - Do not put the value in `.mcp.json`, `.env.example`, or any committed file. `AGENTS.md` forbids an agent writing a real environment file — this step is deliberately manual.
3. Redeploy so the new value is picked up. `getPool()` caches the parsed environment and the pool at process start, so an old instance keeps the old URL until it is replaced.
4. If `scripts/migrate-status.ts`, `scripts/backup.ts` or `scripts/restore.ts` need a direct connection, keep using `PRODUCTION_DATABASE_URL` for those; do not repoint them at the transaction pooler.

## Notes

- Transaction mode does not support session state, cursors, session advisory locks, `SET`, or query pipelining. Nothing in this application relies on those; `select now()`, `FOR UPDATE`, and multi-statement transactions all work.
- node-postgres uses unnamed statements by default, so no prepared-statement switch is needed.
- Ticket 02 bounds the pool in code. Both are needed: the URL change removes the hard 15-backend cap, the pool bound stops one instance from demanding 10 backends.

## Done when

`DATABASE_URL` in Vercel Production and Preview contains `:6543` on a `pooler.supabase.com` host, the app is redeployed, and the next auction window shows no `EMAXCONNSESSION` entries in the runtime logs.
