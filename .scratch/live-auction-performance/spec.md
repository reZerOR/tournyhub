# Live Auction performance

Status: ready-for-agent

> **Continuing this work?** Start at [HANDOFF.md](HANDOFF.md) — it records what is
> done, what is left in executable detail, and the environment facts a fresh
> session needs.

## Problem

A Live Auction with 93 Player Entries, 10 Teams and 11 connected browsers (1 Organizer + 10 Team Representatives) becomes unusable within minutes of starting. The console lags, it stops holding a Realtime connection, Bids surface up to two minutes late, and bidding is disabled outright once the client decides it is stale.

Measured in production on the 2026-09-23 auction (`49b98ace-6ee7-4eb4-905b-69956e0f5886`, revision 228):

| Measurement | Value |
| --- | --- |
| Live commands in the auction | 644 over ~7,200 s = **0.09 commands/second** |
| `SELECT ... FOR UPDATE` on the `auction` row | 644 calls, mean **1,934 ms**, max **10,669 ms** |
| Server-side time of every other statement in those transactions | **0.04–20 ms** |
| `finalize` commands vs. Player Presentations | **301 vs. 39** (7.7×) |
| Bids rejected `stale_revision` | **90 of 192** (46.9%), each a full lock-holding transaction |
| Accepted-bid transaction | ~22 sequential statements under the lock |
| Authorized snapshot | ~67 KiB, ~20–24 queries, 4 duplicated queries |
| `(EMAXCONNSESSION) ... pool_size: 15` errors | **~4,900** |
| `[APIError]: Failed to get session` | **913** |

Evidence and provider comparisons: [`docs/research/live-auction-architecture-2026.md`](../../docs/research/live-auction-architecture-2026.md).

## Diagnosis

This is a **shape mismatch, not a scale problem**. The auction moved ~334 rows; the database was idle more than 99% of the wall clock; and 1,245 s of the 7,200 s auction was spent queueing on a row lock. Real SQL execution explains at most 283 s of that and plausibly 0.6 s, so at least 77% of the wait is self-inflicted. Four causes, all in this repository:

1. Every command holds the row lock across ~22 sequential round trips instead of across server execution.
2. 55% of lock acquisitions are protocol waste: 301 finalizes for 39 Presentations, plus 90 stale-revision Bid rejections.
3. Each committed Revision makes 10 clients re-pull a 67 KiB snapshot that triplicates facts.
4. `DATABASE_URL` targets the Supavisor **session-mode** pooler while `getPool()` sets no `max` (node-postgres defaults to 10 per process), so many Vercel instances exhaust the project's 15-backend session pool.

ADR 0005 already caps this beta at one Live Auction, 16 Teams and 40 connected tabs. This auction used 10 Teams and 11 tabs, so it was **inside** the intended envelope; it failed on execution model, not capacity.

## Goal

Make one Live Auction with up to 40 connected tabs hold a bid-to-screen latency under 250 ms with no connection errors, without leaving Vercel Hobby + Supabase Free and without changing any fairness rule.

## Non-goals

- No new vendor and no re-platform. Options 3–6 in the research note are explicitly deferred to Phase 3.
- No change to Auction Command semantics: Postgres still orders Bids (ADR 0002), and a Bid is still acknowledged only after commit (ADR 0006).
- No change to Legal Completion, Budget, Roster, Tier or Forced Assignment rules.
- Superseding ADR 0005 is out of scope; Phase 1 and Phase 2 stay inside it.

## Phases

- **Phase 1 — configuration and protocol.** No new service. Tickets 01–07. Removes the connection errors and ~55% of lock acquisitions, and stops the snapshot fan-out.
- **Phase 2 — one round trip per command.** Ticket 08. Turns a Bid from ~22 statements into one PostgreSQL function call so the lock is held for server execution.
- **Phase 3 — deferred.** Container in `sin`, Durable Object per Auction, or incremental sync. Trigger conditions are recorded in the research note; only revisit when the beta needs more than one concurrent Live Auction.

## Acceptance criteria

Measured by ticket 07's rehearsal against a production-like environment:

1. Zero `(EMAXCONNSESSION)` and zero `Failed to get session` for a full auction window.
2. Lock acquisitions per Player Presentation ≤ 1.2 (from 7.7).
3. `stale_revision` rejections ≤ 5% of Bid attempts (from 46.9%).
4. Mean `SELECT ... FOR UPDATE` wait < 250 ms (from 1,934 ms).
5. No client-side `connectionStale` Bid disable during a two-hour auction.
6. An `unchanged` check response ≤ 1 KiB; a full snapshot ≤ 20 KiB (from 67 KiB).
7. Derived egress per auction < 0.1 GiB (from ~0.45 GiB).

## Tickets

| Ticket | Owner | Status |
| --- | --- | --- |
| [01 — Set the transaction-pooler `DATABASE_URL`](issues/01-transaction-pooler-url.md) | Human | resolved |
| [02 — Bound the database pool](issues/02-bound-the-database-pool.md) | Agent | resolved |
| [03 — Elect a single finalizer](issues/03-elect-a-single-finalizer.md) | Agent | resolved |
| [04 — Stop sending Bids that cannot win](issues/04-stop-stale-revision-bids.md) | Agent | resolved |
| [05 — Deduplicate and delta the snapshot](issues/05-snapshot-dedupe-and-deltas.md) | Agent | ready-for-agent |
| [06 — Stop the console from disabling itself](issues/06-console-render-and-staleness.md) | Agent | resolved |
| [07 — Rehearse the real workload](issues/07-rehearsal-harness.md) | Agent | resolved |
| [08 — One round trip per command (Phase 2)](issues/08-command-rpc.md) | Agent | ready-for-agent |
| [09 — Verify and sign off Phase 1](issues/09-verify-and-sign-off.md) | Human | ready-for-human |

## Human actions

Three things only the repository owner can do; they are tickets 01 and 09, plus one decision:

- **Set `DATABASE_URL`** in Vercel to the transaction pooler (ticket 01). Per `AGENTS.md` an agent must never write a real environment file or a provider secret.
- **Provide a safe rehearsal target** so ticket 07 does not run against a real auction (ticket 09).
- **Decide when to supersede ADR 0005.** Phase 1 and 2 stay free. The moment the beta needs a second concurrent Live Auction or any commercial use, ADR 0005 itself already requires paid infrastructure (Supabase Pro $25/mo, Vercel Pro $20/mo). That decision is not needed now and is not part of this feature.
