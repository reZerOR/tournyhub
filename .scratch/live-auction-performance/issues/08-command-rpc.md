# 08 — One round trip per command (Phase 2)

Status: ready-for-agent
Type: backend
Blocked by: 07

## Progress (2026-09-30)

**Prototyped, measured, reverted.** `finalize_presentation` was ported to a
plpgsql function (`supabase/migrations/…_finalize_presentation_function.sql`,
parameter `(auction_id, actor_user_id, presentation_id, command_id)` returning
the outcome as `jsonb`, with `close-player.ts` reduced to one
`select finalize_presentation(…)` and the `reason` mapped back to
`CLOSE_REJECTION_MESSAGES` so `LiveCommandOutcome` is unchanged). It was
faithful: all **246 database tests passed** and the rehearsal closed **39/39**
Presentations with the duplicate-wake probe still at **0 row locks**.

It was reverted for one reason, and that reason is a prerequisite for the rest:

- `pg_stat_statements.track` defaults to `top`, which **does not record nested
  statements**. Moving the `SELECT … FOR UPDATE` inside a function makes the
  Auction row lock invisible to the exact query this feature is verified and
  reported with (the owner's `where query like '%for update%'`, and the
  rehearsal's lock metric). The rehearsal tried `track=all` and the local
  `postgres` role was refused (`permission denied to set parameter`), so it is
  not a switch this repo can assume even on its own targets. Porting commands
  therefore changes how the critical section is observed, and that has to be
  decided and written down before the port, not discovered after it. The
  mitigation to consider: measure the command *call* (`select place_bid(…)`),
  whose `total_exec_time` includes the nested lock wait — and update the
  handoff's before/after recipe to match.

**The real blocker is the Bid path.** `place_bid` (517 lines) calls
`bidKeepsLegalCompletion`, and `cancelHighestBid`/`reverseSale` call
`auctionKeepsLegalCompletion`. Both run the engine in
`src/domain/legal-completion.ts` (271 lines) and `src/domain/tiered-completion.ts`
(413 lines), which are deliberately shared with Readiness
(`src/domain/readiness.ts`, 385 lines) "so the two can never disagree". ADR 0009
forbids a TypeScript engine and a SQL engine side by side, so `place_bid` cannot
move until one of the two options in **The one real risk** below is chosen and
recorded, and the Readiness path is moved onto the surviving implementation
(`src/server/auction-query/readiness.ts` and its callers, plus the 30 unit tests
in `legal-completion.test.ts`, `tiered-completion.test.ts`, `readiness.test.ts`
and `tiered-readiness.test.ts`). That is an ADR-level decision, not a mechanical
port.

**Ordered plan once the decision is made:**

1. **Decide and record the Legal Completion home** (an ADR or an ADR amendment).
   Either port the engine once to SQL and delete the TypeScript reachability
   engines, or replace the 200,000-node search with a set-based feasibility
   statement. In both cases Readiness must consume the same implementation and
   the four engine/readiness unit tests must become database tests.
2. **Settle the lock observability** (above) and update the handoff's
   `pg_stat_statements` recipe, so acceptance criteria 4 and the owner's
   before/after stay measurable.
3. **`place_bid`** — `src/server/auction-command/place-bid.ts`. Reproduce: lock,
   authorize (a Representative of the bidding Team, else `not_representative`),
   replay by `command_id`, `auction_paused`/`auction_not_live`/`stale_revision`,
   presentation open, `now()` vs `close_deadline`, exact `nextBidAmount`, not
   already leading, Budget, Roster, Tier max, Legal Completion; then insert the
   `bid_attempt` (the `bid_attempt_accepted_price_key` unique violation is the
   race loss and must still return `wrong_amount`), cancel a running warning or
   extend the Timed Close deadline by `ANTI_SNIPE_SECONDS`, bump the Revision,
   write the outbox event, the Audit Entry and the command ledger. The outbox
   payload must keep `bidAttemptId`, `nextBidAmount` and `serverTime`, which
   ticket 05's console delta depends on.
4. **`begin_manual_close` / `cancel_manual_close`** — mechanical once the
   pattern exists; they share no engine.
5. **Corrections** — `cancelHighestBid`, `reverseSale`, `directSale`
   (`src/server/auction-command/corrections.ts`), after step 1.
6. Keep the thin caller identical to the prototype: one
   `select <fn>($1::uuid, …) as outcome`, `reason` mapped to the existing
   message table, `LiveCommandOutcome` unchanged so `live-actions.ts`,
   `use-live-sync.ts` and the UI do not move.
7. Extend `scripts/rehearsal-live-auction.ts` so its lock accounting counts a
   ported command's lock (via `track=all` where permitted, else via the command
   call's execution time), and re-run it before shipping.

Verified only after step 2, by the rehearsal: a Bid is one round trip, mean lock
wait < 50 ms, one Legal Completion implementation, and ADR 0002, 0004, 0006, 0007
and 0009 still satisfied.

## Goal

Reduce a Bid from ~22 sequential statements under the row lock to **one** PostgreSQL function call, so the lock is held for server execution instead of for the network time of 22 awaited round trips. Measured: the statements inside the lock cost 0.04–20 ms server-side, yet the lock wait averages 1,934 ms.

This is the only change that shortens the critical section itself. Phase 1 (tickets 01–06) removes connection exhaustion and ~55% of lock acquisitions; it does not shrink a single command.

## Change

Add `supabase/migrations/<timestamp>_auction_command_functions.sql` with one function per live command, and rewrite each command module into a thin caller.

Start with the two that dominate the workload:

- `place_bid(auction_id, actor_user_id, team_id, presentation_id, amount, expected_revision, command_id)` → returns the `LiveCommandOutcome` shape as JSON.
- `finalize_presentation(auction_id, actor_user_id, presentation_id, command_id)` → same.

Each function performs, in order, exactly what its TypeScript counterpart does today: lock the Auction, authorise the actor, replay a stored command, validate (Presentation state, deadlines via `now()`, exact amount, leader, Budget, Roster, Tier), insert the `bid_attempt` or `sale`, bump the Revision, insert the outbox event, write the Audit Entry, store the command result, and return the outcome. Then continue with `begin_manual_close`, `cancel_manual_close`, and the corrections in `corrections.ts` (`cancelHighestBid`, `reverseSale`, `directSale`).

Then rewrite `src/server/auction-command/place-bid.ts` and `close-player.ts` to a single `pool.query('select place_bid($1, ...) as outcome')`, keeping the exported function signature and `LiveCommandOutcome` exactly as they are so `live-actions.ts`, `use-live-sync.ts` and the UI do not move.

Optionally also fold `getLiveSnapshot` (`src/server/auction-query/live-snapshot.ts`) into one function returning a single JSON document, which removes the remaining ~20-query fan-out in one step.

## The one real risk: do not double-source Legal Completion

`src/server/auction-command/legal-completion-check.ts` loads a feasibility snapshot and calls the shared engines in `src/domain/legal-completion.ts` and `src/domain/tiered-completion.ts`. Those engines are deliberately shared with Readiness "so the two can never disagree". Choose **one** of:

- Port the engine once into SQL (or plpgsql) and **delete** the TypeScript reachability engine, or
- Replace the 200,000-node search with a single set-based feasibility statement.

Keeping a TypeScript engine and a SQL engine side by side is exactly the competing path ADR 0009 forbids. Record whichever choice is made, and state how the remaining single implementation is tested.

## Done when

- A Bid is one round trip; `pg_stat_statements` shows no per-command sequence of ~22 statements.
- Mean `SELECT ... FOR UPDATE` wait is under 50 ms in the rehearsal.
- One Legal Completion implementation exists, with database tests covering the same cases the unit tests cover today.
- ADR 0002, 0004, 0006, 0007 and 0009 are all still satisfied; `LiveCommandOutcome` is unchanged.
