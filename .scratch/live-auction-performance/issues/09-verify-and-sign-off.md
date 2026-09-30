# 09 — Verify and sign off Phase 1

Status: ready-for-human
Type: ops

## Note from implementation (2026-09-30)

Tickets 02, 03 and 04 are implemented and tickets 05 and 06 are partly
implemented. What could be verified without your infrastructure is verified:
`pnpm typecheck`, `pnpm lint` and `pnpm test:unit` (235 tests) pass, and every
changed file is Prettier-clean.

Two things are blocked on you:

1. ~~**`pnpm test:db` cannot run here.**~~ **Done.** The owner started the local
   stack; `pnpm db:migrate` applied the new index migration, `pnpm test:db`
   passed **245 tests across 28 files**, and `pnpm build` succeeds. Tickets 03 and
   05 are no longer unverified against Postgres.
2. **The rehearsal still has no safe target.** Ticket 07 creates a synthetic
   Auction with the real commands, so it must not run against production. The
   local stack is now the right target for the command-volume and latency
   numbers; it **cannot** reproduce the `EMAXCONNSESSION` failure, because that
   was a pooler-configuration problem and the local stack has no pooler. That one
   needs a production auction to confirm.

Also note `pnpm format:check` currently fails on **36 files that this work did
not touch** (including `.commandcode/taste/taste.md`, `realtime-patches/PATCHES.md`
and several `src/components/ui/*` primitives). That is pre-existing. A repo-wide
`prettier --write` would bundle unrelated churn into this change, so it was left
alone rather than done silently.

## Goal

Give the rehearsal a disposable target and confirm the Phase 1 fixes on real infrastructure.

## Steps

1. **Provide a safe target for ticket 07.** The rehearsal creates a synthetic Auction using the real commands, so it must not run against production. Any one of:
   - a second Supabase project or a Supabase development branch, with its own `DATABASE_URL`;
   - the local stack (`pnpm db:start`, then `pnpm db:reset`) pointed at a production-like pooler configuration;
   - a Vercel Preview deployment with its own `DATABASE_URL` (`APP_ENVIRONMENT=preview` refuses the production URL by design).

   Then either point the agent at that `DATABASE_URL`, or run `pnpm rehearsal:bid` yourself and paste the output. Per `AGENTS.md` the agent must not write the real environment file.

2. **Record the before/after numbers** against acceptance criteria 1–7 in the spec: connection errors, lock acquisitions per Presentation, `stale_revision` share, mean `SELECT ... FOR UPDATE` wait, snapshot bytes, egress.

3. **Confirm two facts I could not verify** from the read-only tooling:
   - that the Project's **Connection pooling → Pool Size** really is 15 on this project (the number 15 comes from the runtime error text);
   - whether **Fluid compute** is enabled on the Vercel project, which only matters if Phase 3 ever adds WebSockets (a Vercel Function socket closes at the Function's max duration — 300 s on Hobby — so a two-hour session cannot live in one).

4. **Confirm the region evidence.** The latest production deployment reports `regions: ["sin1"]`, and Supabase is `ap-southeast-1`. Both are Singapore, so the 1,934 ms is not network distance. Confirm no `predeploy`/build-time setting overrides this.

## Done when

A rehearsal run on the disposable target meets acceptance criteria 1–7, the before/after numbers are recorded in `## Comments`, and the two unverified facts above are confirmed or corrected.
