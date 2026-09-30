# 03 — Elect a single finalizer

Status: resolved
Type: backend, frontend

## Answer

**Server.** `finalizePresentation` (`src/server/auction-command/close-player.ts`)
now calls a new `settledOutcome()` before it opens anything: one non-locking read
that returns the committed outcome plus the current Revision when the
Presentation is already `sold`/`unsold`, and only when the caller is the
Organizer or a current Team Representative (`left join sale` on
`reversed_at is null`, so a reversed Sale is reported as `unsold`, matching
`existingOutcome`). A duplicate wake therefore takes no transaction and no row
lock; an unauthorized caller gets no row and falls through to the locked path,
which answers `unauthorized`. The locked path is otherwise untouched, so the
ADR 0007 idempotency backstop still holds.

**Client.** Only the Organizer's console finalizes immediately. A Representative
now waits `REPRESENTATIVE_WAKE_GRACE_MS = 10_000` plus jitter
(`live-console.tsx`), so the Organizer normally wins the close while a close
still completes when the Organizer's tab is closed or offline. The existing
`finalizingFor` guard still prevents one console waking the same Presentation
twice.

Verified: `pnpm db:migrate` applies cleanly and `pnpm test:db` passes — **245
tests across 28 files**, including `live-close.test.ts` and
`live-timed-close.test.ts`, so the locked path still finalizes exactly once.

Measured by ticket 07's rehearsal (39 Presentations):

- **1.00** finalize wake-ups per Player Presentation with the Organizer elected,
  against **11.00** when every console wakes (production logged 7.72). Target
  ≤ 1.2: **met**.
- **10 extra wakes after a committed Presentation cost 0 Auction row locks**,
  proving `settledOutcome()` answers before any transaction is opened.
- Exactly one `accepted` finalize per Presentation, with every duplicate
  returning `replayed`.

## Goal

Stop every connected browser from waking the same Player Presentation close. 301 `finalize` commands were issued for 39 Presentations (7.7×), and 262 of those were surplus lock acquisitions — 41% of all live commands.

## Current behaviour

`src/features/auctions/live/live-console.tsx` (the effect around lines 367–392) runs for **every** participant: the Organizer calls `finalizeAction` immediately when the countdown expires, and each Team Representative calls it after `1500 + Math.random() * 1000` ms. All 11 clients therefore contend for the same `auction` row lock at every close.

## Change — client

- Make the **Organizer's client the designated waker**: it calls `finalizeAction` only for its own Participant role.
- Team Representatives **do not** call `finalizeAction` on the normal path. They keep a liveness fallback: if the Presentation is still `open`/`closing` past its deadline after a grace period (start with 10 s), a Representative may wake it. This keeps a close from stalling when the Organizer's tab is closed or offline.
- Debounce per Presentation: keep the existing `finalizingFor` guard so one browser never wakes the same Presentation twice.

## Change — server

Keep `finalizePresentation`'s idempotency exactly as it is (ADR 0007): a duplicate or repeated command ID must still return the one committed outcome and create no second Sale, Revision or Sale row. That is the correctness backstop for the election above.

Add a **non-locking pre-check** at the top of `finalizePresentation` (`src/server/auction-command/close-player.ts`) so a duplicate wake does not acquire the row lock at all:

1. Read the Presentation and any existing outcome (`existingOutcome`) **before** `begin` / `lockLiveAuction`.
2. If the Presentation is already `sold`, `unsold` or `returned`, return `{ status: "replayed" }` with the stored outcome and the current revision — without opening a transaction.
3. Only enter the transaction when the close still has work to do.

This converts the common duplicate wake from an 8-statement lock-holding transaction into a single read.

## Done when

- A replay of an already-completed Presentation acquires no row lock.
- The rehearsal (ticket 07) reports ≤ 1.2 `finalize` commands per Player Presentation, and every close still produces exactly one Sale or Unsold result.
- `pnpm test:unit` and `pnpm test:db` pass, including the existing finalization-idempotency tests.
