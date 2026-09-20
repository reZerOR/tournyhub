# 15: Close Players manually

**What to build:** Let the Organizer close an Active Player through a three-second warning and produce exactly one Sale or Unsold result.

**Blocked by:** 14, Submit authoritative Bids.

**Status:** resolved

- [x] In Manual Close mode, only the Organizer can begin a three-second closing warning for the Active Player.
- [x] The warning uses a stored database deadline and appears consistently to every participant.
- [x] A valid Bid during the warning atomically cancels the warning, accepts the Bid, and returns the presentation to Open.
- [x] The Organizer can cancel the warning without changing the current leading Team or price.
- [x] An idempotent finalization command creates one Sale for the committed leader after the warning deadline.
- [x] If no valid Bid exists, finalization creates one Unsold result and places the Player in the Unsold Pool.
- [x] The Sale updates the Team's Roster, spent Credits, remaining Credits, and Tier count in the same committed result.
- [x] Duplicate finalizers, stale close commands, and Bid-versus-finalizer races cannot create two outcomes or accept a late Bid.
- [x] Database and browser tests cover reopen, cancellation, Sale, Unsold, exact deadline ordering, retry, and shared final state.

## Comments

Implemented in `src/server/auction-command/close-player.ts`, the `sale` and
`unsold_membership` tables and the `player_presentation` close columns in
migration `20260921130000`, the console close controls, and the close actions.

- **Warning.** `beginManualClose` is Organizer-only, requires Manual Close mode,
  and stores `warning_deadline = now() + 3 seconds` with state `closing`. Every
  participant reads the same database deadline. `cancelManualClose` returns the
  Presentation to `open` without touching the accepted Bid, so the leader and
  price are unchanged.
- **Bid reopens.** `placeBid` accepts a valid Bid during a `closing`
  Presentation and, in the same transaction, clears the warning and returns the
  Presentation to `open`. A Bid after the deadline is rejected
  (`deadline_passed`) under the same lock, so a finalizer and a late Bid cannot
  both win.
- **Idempotent finalization.** `finalizePresentation` locks the Auction, rejects
  an early call (`too_early`), and otherwise creates exactly one outcome: a Sale
  for the committed leader, or an Unsold result that inserts an
  `unsold_membership` row. Terminal Presentations return their existing outcome,
  the `sale.presentation_id` unique constraint and the `unsold_membership`
  primary key back that up, and a repeated command ID replays the stored result,
  so duplicate finalizers create one Sale or Unsold result.
- **Roster accounting.** A Sale is the single source of truth for Roster size,
  spent Credits, remaining Credits, and Tier counts; the snapshot derives all of
  them from committed `sale` rows in the finalization transaction, so they update
  together.

Verification: `pnpm test:db` (`tests/database/live-close.test.ts`: stored
three-second deadline and non-Organizer denial, Manual-Close refusal on a Timed
Auction, cancel without changing the leader, Bid-during-warning reopen,
too-early rejection then one Sale, Unsold with Unsold-Pool membership, duplicate
finalizers producing one outcome, and a late Bid rejected after the deadline),
and `pnpm test:browser` (`tests/browser/readiness.spec.ts`: cancel a warning,
then finalize a Sale).
