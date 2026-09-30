# Handoff — Live Auction performance

Status: in progress. Written 2026-09-30 so a fresh session can continue without
re-reading the whole investigation.

**Start here:** read this file, then `.scratch/live-auction-performance/spec.md`
and the tickets in `.scratch/live-auction-performance/issues/`. Then do
"Next work" below, in order, without asking for a further go-ahead.

## The problem

A Live Auction with 93 Player Entries, 10 Teams and 11 connected browsers
(1 Organizer + 10 Team Representatives) became unusable minutes after starting:
the console lagged, it stopped holding a Realtime connection, Bids surfaced up to
two minutes late, and bidding was disabled outright.

Root causes, measured in production (auction `49b98ace-6ee7-4eb4-905b-69956e0f5886`,
93 players / 10 teams / revision 228, project `kscfkczaguadstdifuhr`):

| Measurement | Value |
| --- | --- |
| `SELECT ... FOR UPDATE` on the `auction` row | 644 calls, mean **1934 ms**, max **10669 ms** |
| every other statement in those transactions | 0.04–20 ms server-side |
| `finalize` commands vs Player Presentations | **301 vs 39** (7.7×) |
| Bids rejected `stale_revision` | **90 of 192** (46.9%) |
| `(EMAXCONNSESSION) ... pool_size: 15` errors | **~4900** |
| `[APIError]: Failed to get session` | **913** |

This is a **shape mismatch, not a scale problem**: ~334 rows, the database idle
>99% of the wall clock, and 1245 s of a 7200 s auction spent queueing on a row
lock. ADR 0005 already caps this beta at one Live Auction, 16 Teams and 40 tabs,
so the auction was inside the intended envelope.

Full analysis and provider comparison: `docs/research/live-auction-architecture-2026.md`.
Flow reference: `docs/live-auction-page-flow.md`.

## Already done, verified

Nothing is committed. The working tree holds the changes below, those in "Added
2026-09-30", and the new untracked paths — run `git status --short`.

- **Pool bound** (`src/server/database/pool.ts`) — explicit `max: 3`,
  `idleTimeoutMillis`, fail-fast `connectionTimeoutMillis: 5000`,
  `allowExitOnIdle`. `.env.example` documents that the runtime `DATABASE_URL`
  must be the transaction pooler on `6543`.
- **Single finalizer** (`src/server/auction-command/close-player.ts`) —
  `settledOutcome()` reads a committed Presentation without opening a transaction,
  so a duplicate wake takes **no row lock**. `live-console.tsx` makes the
  Organizer's console the designated finalizer; Representatives wait
  `REPRESENTATIVE_WAKE_GRACE_MS` (10 s) as a liveness fallback.
- **No stale-revision rejections** (`live-console.tsx`) — `dispatch` returns its
  payload and never surfaces a `stale_revision` message; new `submitBid()` retries
  once against the fresh snapshot the rejection already carries. The server's
  `expectedRevision` check is deliberately unchanged.
- **Console staleness** (`live-console.tsx`, `use-live-sync.ts`) — `useLiveSync`
  now also returns `syncing`; an in-flight check is not treated as a lost
  connection. Window is 45 s with a live socket, 15 s degraded. This is what
  silently set `canBid` false. Bid feed capped at `BID_FEED_LIMIT = 50`.
- **Lost nudges** (`src/server/realtime/notify-revision.ts`) — outbox rows are
  only marked published when the Broadcast POST succeeds, so a dropped nudge is
  retried. `tests/unit/notify-revision.test.ts` was corrected (it asserted the
  old buggy behaviour).
- **Missing index** (`supabase/migrations/20260930090000_player_presentation_entry_state_index.sql`)
  — `player_presentation ("player_entry_id", "state")`. The existing partial
  unique index does not cover the `('open','closing','sold','unsold')` predicate
  these queries use.
- **Rule Set read deduplicated** (`src/server/auction-query/live-snapshot.ts`) —
  that single row was read twice per snapshot; one read now serves Budget, Roster
  limits, Bid Increment and Timed Close duration.
- **Rehearsal harness** (`scripts/rehearsal-live-auction.ts`, `pnpm rehearsal:live`)
  — see "Rehearsal" below.

Measured A/B from the rehearsal (39 Presentations, 5 bidders per lot):

| Metric | before (all / blind) | after (organizer / preflight) | production |
| --- | --- | --- | --- |
| finalize wake-ups per Presentation | 11.00 | **1.00** | 7.72 |
| Bids rejected `stale_revision` | 100% | **0%** | 46.9% |
| commands (= row locks) per Presentation | 17.95 | 8.08 | ~16.5 |
| 10 extra wakes after a committed Presentation | **0 row locks** | **0 row locks** | 1 lock each |
| full snapshot | 21.5 KiB | 40.1 KiB | ~67 KiB |
| `unchanged` check | 77 B | 77 B | 77 B |

Ticket status: **02, 03, 04, 06, 07 resolved**. **05 items 1–4 implemented**, but
its Done-when (≤ 20 KiB snapshot, ≥ 4 fewer queries) is not met — the snapshot is
33.0 KiB and queries fell by 3; the remainder is a Player-directory decision, not
another dedupe. **08 planned, not implemented**: the Bid path is blocked on the
Legal Completion decision ADR 0009 forces, and a prototype port was reverted for
breaking the lock measurement; see ticket 08's Progress and "Next work" below.
01 and 09 are the human's.

### Added 2026-09-30

- **Ticket 05 items 1–4.** The role is derived from the Team rows instead of a
  second `auction` read, and `loadTeamMinimumStates` replaced the duplicated spend
  and Tier-count aggregates: **3 fewer queries**. `teams[].players` left the wire;
  the ~10 Representatives travel once as a top-level `representatives` array and
  `live-roster-panel.tsx` derives each roster from them plus `openSales`
  (`live-teams-roster.tsx`, the only other reader, was unreferenced and deleted).
  `notifyRevision` broadcasts `{ revision, kind, payload }`; `applyLiveDelta`
  (`src/domain/live-delta.ts`) applies `bid_accepted`, `close_warning` and
  `close_warning_cancelled` and falls back to the pull for any other kind or a
  Revision gap. The `bid_accepted` payload gained `bidAttemptId`,
  `nextBidAmount` and `serverTime` so a console can advance from it alone.
- **Ticket 06.** The console's derived block was hoisted above the `finished`
  early return and memoized; `LiveHeaderBar` and `LiveOrganizerTools` are `memo`
  with stabilised props; the render-phase `setState` in `live-players-panel.tsx`
  became an effect and its per-Tier counts are a single pass.
- **Rehearsal.** `--sync=pull|delta` exercises the delta applier end to end, and
  the lock metric now sums every normalized `FOR UPDATE` statement instead of
  only the top one.
- **Measured:** full snapshot 40.1 → **33.0 KiB**; 154 deltas applied at ~248 B
  each. Everything else in the A/B table above is unchanged.

## Next work

Items 1–4 of the earlier list are done. What remains:

1. **Ticket 05's byte target.** The snapshot is 33.0 KiB against a 20 KiB target;
   the bulk is the 93-row public Player directory. Decide what it carries —
   compact keys, or a `since`-scoped directory delta — before touching the
   presentation contract. The delta broadcast is in and unit/database tested, but
   has never gone over a real Realtime socket: the rehearsal simulates the push by
   reading the outbox.
2. **Ticket 08.** Its Progress section holds the decision and the ordered plan.
   In short: choose the single Legal Completion implementation (port the engine to
   SQL and delete the TypeScript reachability engines, or replace the 200,000-node
   search with a set-based statement), move Readiness onto it, settle how the
   Auction row lock is observed once commands are functions
   (`pg_stat_statements.track=top` hides nested statements, so the current
   `%for update%` recipe and the rehearsal's metric would silently stop reporting
   it), then port `place_bid` before the corrections.
3. **Ticket 09** still needs the owner: a safe rehearsal target, the two
   unverified facts, and the recorded before/after numbers.

## Environment facts

- **App** — Next.js 16.3.5 on Vercel (project `tournyhub`), production deployment
  is already `regions: ["sin1"]` (Singapore). `src/proxy.ts` exists (Next 16's
  rename of middleware); it only reads the session cookie for `/app/*` and touches
  no database, so it adds no connection load.
- **Production DB** — Supabase `kscfkczaguadstdifuhr` (`tournyhub`),
  `ap-southeast-1`, organization plan **free**. **Never run the rehearsal or the
  database suite against it.**
- **Local Supabase** — `pnpm db:start` under WSL Docker. A Windows shell cannot
  see `docker`/`supabase status` as healthy; check ports 54321–54324 with
  `netstat` instead. After editing `.env.local` the running `pnpm dev` must be
  restarted.
- **`.env.local` currently points `DATABASE_URL` at the remote test project**
  `qupolebvejpalcxcrejc` (`turnyhubTest`, `ap-southeast-1`) through the
  transaction pooler on `6543`, host `aws-0-ap-southeast-1.pooler.supabase.com`.
  The password is held by the repository owner — ask them; it is deliberately not
  recorded here.
- **Consequence:** `pnpm test:db` **times out** in this workspace, because every
  round trip is ~600 ms against the suite's 15 s per-test timeout. Prefix a
  loopback target instead:
  `set "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres"`.
  Against local the suite is **245 tests / 28 files in ~36 s**.
- The test project has had all 17 migrations applied from scratch, so it is usable
  as a production-shaped target.
- **Vercel MCP returns 401** — the token expired, re-auth with `/mcp` → `vercel`.
  **Supabase MCP works** (read-only SQL, logs, advisors).

## Rehearsal

```
pnpm rehearsal:live -- --database-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  --lots 39 --finalizers=organizer --bids=preflight
```

Flags: `--finalizers=all|organizer`, `--bids=blind|preflight`,
`--lots`, `--rounds`, `--bidders`, `--poll-ms`, `--duplicate-finalizes`.

It takes its own `--database-url` so it ignores `.env.local`, refuses to run when
`APP_ENVIRONMENT=production` without `--allow-production`, and **deletes its own
prior `Rehearsal rehearsal-%` Auctions and `rehearsal-%@example.com` Users** on
start and exit so it is re-runnable. Because of that cleanup: never point it at a
real database.

`pnpm rehearsal:bid` (`scripts/rehearsal-bid-latency.ts`) is deliberately
untouched — it is the quick single-loop p95 gate.

**Known limit:** it awaits the Bids of one lot rather than firing them
simultaneously, so it measures command *volume* faithfully but not true
concurrent lock contention. Firing a lot's Bids with `Promise.all` is the
refinement if a contention figure is wanted.

## Hard rules

- Follow `AGENTS.md`. **Never create or edit a real environment file** — only
  `.env.example`. Adding a variable means updating `.env.example` and
  `src/config/environment.ts`'s schema, and the owner sets the real value.
- Read the relevant ADRs before changing Auction behaviour, terminology,
  architecture, security or persistence: `docs/adr/`. The binding ones here are
  **0002** (server-authoritative ordering), **0004** (immutable history), **0005**
  (constrained zero-cost stack), **0006** (commit before acknowledge/broadcast),
  **0007** (database deadlines, idempotent finalization), **0008** (brokered
  private Realtime tokens), **0009** (one Auction Command module).
- The beta allows **one Live Auction at a time**.
- Do not commit anything unless the owner asks. `.mcp.json` is now gitignored.

## How to verify

```
pnpm typecheck && pnpm lint && pnpm test:unit
set "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres" && pnpm test:db
pnpm build
pnpm exec prettier --check <files you changed>
```

`pnpm format:check` fails repo-wide on **36 files this work never touched**
(including `.commandcode/taste/taste.md` and several `src/components/ui/*`
primitives). That is pre-existing; do not sweep it into this work. Do not edit
`taste.md` at all.

## Known issues that are NOT part of this work

- **`pg` deprecation warning** in the database suite: `Calling client.query() when
  the client is already executing a query`, from
  `tests/database/live-players.test.ts:10` (`let db: PoolClient` — a single pooled
  client) passed into `getLiveSnapshot`, which fires a `Promise.all` of queries.
  Production always passes the Pool, so this is test-only today, but it becomes an
  error in pg@9. Root cause is that `Queryable = Pick<Pool, "query">` also matches
  a `PoolClient`, so the compiler cannot stop it. Fix by narrowing that parameter
  or passing `pool` in that test.
- **ADR 0008 does not match the code.** It claims Supabase Realtime uses "private
  channels and row-level policies"; the implementation uses a **public** Broadcast
  topic with the secret in the topic name (`private: false`) and there are **zero
  RLS policies** anywhere in `supabase/`. Security gap, unticketed.
- **`.scratch/direct-sale/issues/06`** — `select count(*) from "sale" where
  "source" = 'direct'` returns **0**, so no Direct Sale has ever succeeded. The
  schema fix already exists (migration `20260922130002` drops `NOT NULL` on
  `sale.presentation_id`, confirmed nullable in production), so the remaining work
  is a database test proving the command works end to end. Ticket 06 in that
  feature has the detail; tickets 02/03/05 there also have stale statuses.

## What the owner still owns

1. **The deploy decision.** Nothing is committed; they have not chosen whether to
   commit and push or do it themselves.
2. **Real-auction evidence.** `EMAXCONNSESSION` was a pooler-configuration
   problem and cannot be reproduced on loopback. Before the next auction run
   `select pg_stat_statements_reset();` in production, then afterwards read
   `select calls, round(mean_exec_time::numeric,1) as mean_ms, max_exec_time from
   pg_stat_statements where query like '%for update%' order by total_exec_time
   desc limit 3;` — today it reads ~1934 ms mean / 10669 ms max. Expect the
   connection errors gone and lock acquisitions down ~55%; the mean only falls to
   tens of milliseconds once ticket 08 lands. **That recipe changes with ticket
   08**: a `FOR UPDATE` inside a plpgsql function is a nested statement and
   `pg_stat_statements.track=top` does not record it, so measure the command call
   (`select place_bid(…)`) instead once the port starts.
3. **The Legal Completion / ADR 0009 decision** before ticket 08's Bid path can
   move: one implementation must survive (the engine ported to SQL, with the
   TypeScript reachability engines deleted, or the 200,000-node search replaced
   by a set-based statement), and Readiness has to consume it. Ticket 08's
   Progress section has the full plan.
4. **Deleting `turnyhubTest`** when they are finished with it.
5. **Re-auth the Vercel MCP** if they want agent-side verification of Vercel
   settings.
6. **Deciding when to supersede ADR 0005** — only needed for a second concurrent
   Live Auction or any commercial use (Supabase Pro $25/mo, Vercel Pro $20/mo).
