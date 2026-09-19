# Database

`pool.ts` exposes a single hot-reload-safe `pg.Pool`, reused by Better
Auth's Kysely adapter and by the application's own raw queries (such as
the OTP rate-limit log). Migrations live under `supabase/migrations/`.
