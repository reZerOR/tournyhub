# 20: Cancel Bids and reverse Sales

**What to build:** Let the Organizer correct accepted live outcomes while Paused without deleting or rewriting Auction history.

**Blocked by:** 17, Pause, resume, and recover live state; 18, Progress Tiers and run Unsold Rounds.

**Status:** resolved

- [x] Only the Organizer can cancel the current highest Bid, and only while the Auction is Paused.
- [x] Cancellation marks the accepted Bid cancelled, records the reason, and restores the preceding valid Bid or Starting Price.
- [x] Every prior Bid attempt remains immutable and inspectable after cancellation.
- [x] Only the Organizer can reverse a completed Sale, and only while Paused and before Auction completion or cancellation.
- [x] Sale Reversal creates a compensating record, refunds the Team, removes the active Roster assignment, and returns the Player to the Unsold Pool.
- [x] Cancellation and reversal are rejected when the resulting Auction has no Legal Completion or conflicts with another committed correction.
- [x] Each correction records the responsible User, database time, reason, safe before and after details, and a participant announcement.
- [x] Concurrent correction requests serialize under the Auction command lock and cannot duplicate refunds, Roster removals, or revisions.
- [x] Integration and browser tests cover all restored states, audit visibility, invalid lifecycle, feasibility failure, idempotent retry, and correction races.

## Comments

Implemented in `src/server/auction-command/corrections.ts`
(`cancelHighestBid`, `reverseSale`), the `cancelled` Bid status and its
cancellation columns, the `sale_reversal` table, and `sale.reversed_by_user_id`
in migration `20260921140000`, plus the Corrections panel of the live console.

- **Shared prelude.** Every correction runs the same opening: lock the Auction,
  confirm the Organizer, replay a stored command ID, require Paused, require the
  expected revision, and require a reason of at most 200 characters. A
  correction can therefore never race live bidding.
- **Bid cancellation.** The highest accepted Bid keeps its amount, Team, and
  server time and only gains `status = 'cancelled'`, the reason, the database
  time, and the responsible User. The partial unique index on accepted prices no
  longer sees it, so the preceding valid Bid becomes the leader again, or the
  Player returns to its Starting Price when no Bid remains. Every attempt stays
  readable, including the cancelled one.

  **What compensates the change.** `docs/database-and-commands.md` prescribes
  this exact mechanism — "It marks that accepted Bid cancelled, records the
  reason, restores the preceding valid Bid or Starting Price" — and ADR-0004
  requires a cancelled Bid to remain as an immutable Audit Entry. The Bid row
  keeps every fact it held, and the Audit Entry records the responsible User,
  the database time, the reason, and the before/after leader. Sale Reversal
  additionally needs its own table because a Sale is what drives the Roster,
  spend, and remaining Credits, so the compensating record has to sit beside
  those derivations; a cancelled Bid drives no derived state beyond the leader,
  which the remaining accepted Bids already establish.
- **Sale Reversal.** The original Sale stays in place with `reversed_at`,
  `reversed_reason`, and `reversed_by_user_id`, and gains a compensating
  `sale_reversal` row. The refund and the removed Roster entry follow from the
  committed rows, so they can never disagree. The reversed Player returns to the
  Unsold Pool and can be offered again.
- **Rejected when infeasible.** Both corrections re-run the shared Legal
  Completion engine after applying their change and roll back with
  `no_legal_completion` when the Auction could no longer finish. Cancelling a
  Bid whose Bid is already cancelled, and reversing an already reversed Sale,
  are refused as `no_bid` and `already_reversed`.
- **Participant announcement.** Each correction writes an Audit Entry with safe
  before and after details and a reason, and its outbox event carries a
  participant-readable announcement, so the committed revision every console
  receives explains the change.
- **Concurrency.** Both commands serialize under the Auction lock. Competing
  reversals produce one accepted and one `already_reversed`, competing
  cancellations produce at most one accepted, and a repeated command ID replays
  the stored result instead of duplicating a refund or a revision.

**Decision.** A Sale Reversal sets the reversed Sale's Presentation to
`returned` with the reversal reason. The Presentation no longer ends in an
active Sale, which lets the Player be offered again, and the Sale plus its
compensating `sale_reversal` row remain the authoritative record.

Verification: `pnpm test:db` (`tests/database/live-corrections.test.ts`:
Organizer-only and Paused-only guards, a required reason, restoration of the
preceding Bid, restoration of the Starting Price, every attempt still readable
after cancellation, no-Bid and unknown-Sale refusals, a defensive
`no_legal_completion` refusal, duplicate-command replay, competing cancels, a
reversal that refunds and shrinks the Roster and returns the Player to the Pool,
an already-reversed refusal, competing reversals with one compensating record,
and a reversed Player offered again after Resume), and `pnpm test:browser`
(`tests/browser/live-corrections.spec.ts`: cancelling the highest Bid while
Paused, the Corrections panel absent while Live, and reversing a Sale with the
refund and the shrunk Roster visible on the console).
