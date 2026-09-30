# 07 — Rehearse the real workload

Status: resolved
Type: testing
Blocked by: 09

## Answer

`scripts/rehearsal-live-auction.ts` (**new**, `pnpm rehearsal:live`) covers this
purpose. It builds a production-sized Auction with the real commands (93 Player
Entries, 10 Teams, 6 Tiers, roster 9–10, Budget 9000, increment 50, Manual
Close), then drives 11 simulated consoles through a full Presentation lifecycle:
offer, a Bidding round, the three-second Manual Close warning, and the finalize
wake-ups. `rehearsal-bid-latency.ts` is left untouched, so `pnpm rehearsal:bid`
still works as its own single-loop p95 gate.

Client behaviour is switchable, so before/after is measurable **without touching
application code**:
- `--finalizers=all|organizer` — every console wakes the close, or only the Organizer
- `--bids=blind|preflight` — bid against a possibly stale revision, or refresh and retry once

It also takes its own `--database-url` (independent of `.env.local`), refuses to
run when `APP_ENVIRONMENT=production` without `--allow-production`, cleans up
its own prior Auctions and Users so it is re-runnable, measures
`pg_stat_statements` deltas, and probes the cost of extra wakes after a
committed Presentation.

Measured against the local stack, 39 Presentations, 5 bidders per lot (matching
production's ~4.9 Bids per Presentation):

| Metric | before (all / blind) | after (organizer / preflight) | production |
| --- | --- | --- | --- |
| finalize wake-ups per Presentation | **11.00** | **1.00** | 7.72 |
| Bids rejected `stale_revision` | 195/195 = **100%** | 0/195 = **0%** | 46.9% |
| commands (= row locks) per Presentation | 17.95 | 8.08 | ~16.5 |
| 10 extra wakes after a committed Presentation | **0 row locks** | **0 row locks** | 1 lock each |
| full snapshot | 21.5 KiB | 40.1 KiB | ~67 KiB |
| `unchanged` check | 77 B | 77 B | 77 B |
| mean Auction lock wait | 17.1 ms | 0.0 ms | 1934 ms |

**This closes tickets 03 and 04**: 1.00 wake-ups per Presentation and 0% stale
rejections are both inside their targets.

## Honest limits

- **The 100% stale figure is a worst case, not production's 46.9%.** Blind mode
  never refreshes a console's revision, while a real console refreshes on every
  Broadcast. The two modes bracket the problem; they do not reproduce the exact
  production rate.
- **Bid latency and lock waits here are loopback figures.** The harness awaits
  Bids within a lot rather than firing them simultaneously, so it measures
  command *volume* faithfully but not true simultaneous lock contention.
  Production's 1934 ms mean came from many Vercel instances against a 15-backend
  session pooler plus a ~600 ms cross-region round trip; neither is reproducible
  on a loopback socket. The connection half is covered by the pooler probe in
  ticket 09 instead.
- **The snapshot target is not this ticket's.** 40.1 KiB at a comparably full
  state is the current shape; the ≤ 20 KiB target belongs to ticket 05, which is
  not implemented.
- A next refinement, if a contention measurement is wanted: issue the Bids of one
  lot with `Promise.all` so they truly race for the Auction row lock.

## Goal

Build a rehearsal that can actually reproduce the reported failure. The existing `scripts/rehearsal-bid-latency.ts` **awaits Bids in a loop** from a single process, so it cannot reproduce concurrent contention, a snapshot fan-out, a finalize storm, or a `stale_revision` race. It therefore passed while production fell over.

## Change

Extend `scripts/rehearsal-bid-latency.ts` (keep `pnpm rehearsal:bid` working) so it models the workload that failed:

1. **11 concurrent clients** — 1 Organizer + 10 Representatives, each with its own session and own local `revision`, driven with `Promise.all` rather than sequentially.
2. **93 Player Entries, 10 Teams, 6 Tiers, roster 9–10, budget 9000, increment 50** — the real shape from `49b98ace-6ee7-4eb4-905b-69956e0f5886`.
3. **A full Presentation lifecycle** — offer, concurrent Bids, manual close with a three-second deadline, and finalize woken by **every** client (the pre-fix behaviour) so the fan-out is measurable.
4. **39 Presentations** so the finalize-per-presentation ratio is comparable to the 301/39 measured in production.
5. **Snapshot polling** — each client polls `/api/auctions/[id]/snapshot?since=N` on the 15 s / 3 s cadence and pulls on Broadcast, so the connection demand is realistic.
6. **Production-representative connection settings** — the rehearsal must respect the pool bound from ticket 02 and the URL mode from ticket 01, or the `EMAXCONNSESSION` failure will not reproduce.

## Report

Print, and exit non-zero when the spec's acceptance criteria are not met:

- Bid latency p50 / p95 / max, server-observed.
- `SELECT ... FOR UPDATE` acquisitions and mean wait, read from `pg_stat_statements` before and after the run.
- Lock acquisitions per Player Presentation.
- `stale_revision` rejections as a share of Bid attempts.
- Finalize commands per Player Presentation.
- Snapshot response bytes (full and `unchanged`) and a derived per-auction egress estimate.

## Safety

This must never run against a real auction. It creates a synthetic Auction with real commands, so it needs a disposable target — see ticket 09. Refuse to start when `APP_ENVIRONMENT=production` unless an explicit override flag is passed.

## Done when

Against the pre-fix configuration the rehearsal reproduces the failure (connection errors or a p95 Bid latency well above the target), and against the post-fix configuration it meets acceptance criteria 1–7 in the spec.
