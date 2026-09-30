# 05 — Deduplicate and delta the snapshot

Status: ready-for-agent
Type: backend
Blocked by: 02

## Progress

**Done:**

- New migration
  `supabase/migrations/20260930090000_player_presentation_entry_state_index.sql`
  adds the `("player_entry_id", "state")` index. Confirmed genuinely missing in
  production: the only related index is the partial unique
  `player_presentation_pending_or_sold_key`, whose predicate does not cover the
  `('open','closing','sold','unsold')` predicate these queries use, and no index
  leads with `player_entry_id`. Applied locally with `pnpm db:migrate`; the whole
  database suite passes with it in place (**245 tests across 28 files**).
- `notify-revision.ts` no longer marks outbox rows published when the Broadcast
  `POST` fails, so a dropped nudge stays pending and is retried by the next
  command instead of waiting for the poll. `tests/unit/notify-revision.test.ts`
  was updated — the previous test asserted the buggy behaviour ("does not throw
  on HTTP failure and still marks events published") and now asserts the rows
  stay pending.
- The duplicate `auction_rule_set` read is gone: one read now serves the Budget,
  Roster limits, Bid Increment and Timed Close duration. That single row was read
  twice on every snapshot.

**Remaining — now implemented.** All four items landed:

1. **The `auction` row is read once.** `getLiveSnapshot` derives the role from
   the `team` select's new `representative_user_id` column instead of calling
   `resolveLiveRole`, which re-read the Auction row. The exported
   `resolveLiveRole` stays for `grant.ts` and `live-actions.ts`. Saves 1 query.
2. **The spend aggregate and the per-Tier UNION are gone.**
   `loadTeamMinimumStates` moved into the earlier batch and supplies
   `spentCredits`, `rosterCount` and `tierCounts` for every Team. The
   `"unassigned"` bucket is the roster remainder
   (`rosterCount - sum(perTierCounts)`), as the ticket warned. Saves 2 queries.
3. **The triplication is gone.** `teams[].players` was removed from the wire; the
   ~10 Representatives travel as a top-level `representatives` array and
   `live-roster-panel.tsx` derives each Team's roster from it plus `openSales`, so
   `LiveRosterPlayer.source` survives. The only other reader,
   `live-teams-roster.tsx`, was unreferenced and was deleted.
4. **The delta broadcast.** `notifyRevision` now broadcasts each pending outbox
   event as `{ revision, kind, payload }`. `applyLiveDelta`
   (`src/domain/live-delta.ts`) applies the kinds whose payload is complete and
   whose effect is self-contained — `bid_accepted`, `close_warning`,
   `close_warning_cancelled` — and returns null for everything else, which falls
   back to the pull; a Revision gap does too, so the pull stays the resync path.
   Only public changes are broadcast (a rejected Bid never reaches the outbox).
   The `bid_accepted` outbox payload now also carries `bidAttemptId`,
   `nextBidAmount` and `serverTime` so a console can advance from it alone.

**Measured** (`pnpm rehearsal:live -- --lots 39 --finalizers=organizer
--bids=preflight --sync=delta`), against the 40.1 KiB baseline:

| Metric | before | after |
| --- | --- | --- |
| full snapshot | 40.1 KiB | **33.0 KiB** |
| pulls per run | 484 | 429 |
| delta applied | n/a | 154 events, ~248 B each |

**Still open.** Done-when asks for a ≤ 20 KiB snapshot and ≥ 4 fewer queries. The
snapshot is ~33 KiB (the triplication removal is the ~7 KiB the ticket predicted)
and queries fell by **3**, not 4 — the remaining bulk is the 93-row public Player
directory, which nothing in this ticket touches. Closing that needs a decision on
what the directory carries (compact keys, or a `since`-scoped directory delta);
it is a change to the presentation contract, not another dedupe. Item 4 is also
covered only by unit and database tests: the rehearsal has no Realtime socket, so
it simulates the push by reading the outbox rather than a real Broadcast.

**Environment note.** `pnpm test:db` times out against this workspace because
`.env.local` points at the remote `turnyhubTest` project (~600 ms per round trip
against the suite's 15 s per-test timeout). Prefix a loopback target instead:
`set "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres"`.
Against local the suite is **245 tests / 28 files in ~36 s**.

## Goal

Stop making every client re-download the whole auction state on every committed change, and stop the snapshot from shipping the same facts three times and re-running four identical queries.

## Current behaviour

`src/server/auction-query/live-snapshot.ts` builds a ~67 KiB payload of ~20–24 queries. Measured problems in that one function:

- The `auction` row is read twice (line ~166 and again inside `resolveLiveRole`).
- `auction_rule_set` is read twice (budget/roster at ~366, increment/deadlines at ~449).
- The Team spend aggregate is read twice (~232 and again in `loadTeamMinimumStates`).
- The per-Team-per-Tier count UNION is read twice (~241 and again in `loadTeamMinimumStates`).
- The same Sale and Roster facts appear three times: `players[]`, `openSales[]`, and `teams[].players[]`.

`src/server/realtime/notify-revision.ts` broadcasts only `{ revision }`, so each of the other 10 clients responds by pulling that whole payload. The outbox row it reads already stores `kind` and the event `payload` — those are written and never sent.

## Change 1 — one read per fact

In `live-snapshot.ts`, read the auction row once and pass `organizer_id`/`status`/`revision` down instead of re-querying in `resolveLiveRole`. Read `auction_rule_set` once. Reuse the spend and Tier-count results already produced by `loadTeamMinimumStates` (`src/server/auction-query/progress.ts`) rather than recomputing them.

## Change 2 — one authoritative shape

Remove the triplication. Pick a single home for Sale and Roster facts and make the other views derive from it. `live-players-panel.tsx` and `live-roster-panel.tsx` read `players` and `teams[].players`; keep one of them as the source and derive the other in the client, or have the server send a compact normalised shape.

## Change 3 — a covering index

Add a migration creating an index that the correlated subqueries can actually use:

```sql
create index if not exists "player_presentation_entry_state_idx"
  on "player_presentation" ("player_entry_id", "state");
```

The existing `player_presentation_pending_or_sold_key` is a **partial** unique index on `("player_entry_id") where state in ('open','closing','sold')`, which does not serve the `('open','closing','sold','unsold')` predicate used by `countUnresolvedBiddablePlayers` (`progress.ts`), `loadEligiblePlayers` (`select-player.ts`, a `LEFT JOIN LATERAL`), and the eligible-count query in `live-snapshot.ts`. There is no plain index on `player_entry_id`.

## Change 4 — broadcast the delta

The outbox already carries what changed. Send `{ revision, kind, payload }` in the Broadcast and let `use-live-sync` apply it as a delta, keeping the `GET /api/auctions/[id]/snapshot?since=N` path as the **resync** route for a client that reconnects, falls behind, or fails to apply a delta.

Constraints:

- A delta must respect ADR 0006: it is only ever produced after commit.
- A delta must not leak what the snapshot deliberately withholds. Rejected Bid details are visible only to the Organizer and the submitting Representative, and phone numbers are excluded from the directory. Only broadcast deltas that are already public to every participant (an accepted Bid, a Sale, a Revision), and fall back to a full pull when a delta would carry a filtered view.
- The revision check must still reject an out-of-order delta.

## Change 5 — stop losing nudges

In `notify-revision.ts`, `markOutboxPublished` runs even when the Broadcast `POST` fails, so a dropped notification is never retried and is only recovered by the 15 s / 3 s poll. Mark rows published only when the `POST` succeeds; otherwise leave them pending for the next attempt.

## Done when

- An `unchanged` check response is ≤ 1 KiB and a full snapshot ≤ 20 KiB.
- The snapshot issues at least 4 fewer queries.
- A committed Bid reaches the other 10 clients through a delta, with the full pull still working as resync.
- `pnpm test:db` and `pnpm test:unit` pass.
