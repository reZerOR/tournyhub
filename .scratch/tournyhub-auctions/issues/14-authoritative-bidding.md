# 14: Submit authoritative Bids

**What to build:** Let each Team Representative submit the exact next Bid and receive a committed authoritative result under contention.

**Blocked by:** 13, Select and reveal the Active Player.

**Status:** resolved

- [x] The representative console shows the Active Player, price, leader, exact next Bid, remaining Budget, reserved Credits, Roster capacity, Tier capacity, and connection state.
- [x] A Bid command includes a unique command ID, expected Auction revision, Active Player, Team, and exact offered amount.
- [x] The server derives the actor and represented Team from the session and rejects forged Team, Player, or Organizer authority.
- [x] PostgreSQL locks the relevant Auction state and uses database time before checking lifecycle, presentation, deadline, price, current leader, Budget, total maximum, and Tier maximum.
- [x] The shared Legal Completion engine rejects a Bid that would prevent any required final allocation or leave insufficient reserved Credits.
- [x] The first valid simultaneous transaction for one price wins, and every other attempt receives a stable private rejection.
- [x] Repeating a command ID returns its original result without creating a second Bid, revision, or distribution event.
- [x] The submitting UI remains pending until commit and never displays an uncommitted Bid as accepted.
- [x] Accepted Bids are visible to participants after commit, while rejected amount, time, and reason remain visible only to the Organizer and submitting representative.
- [x] Integration and browser tests cover all rejection reasons, simultaneous Bids, stale state, forged inputs, response loss and retry, and monotonic revisions.

## Comments

Implemented in `src/server/auction-command/place-bid.ts`,
`src/server/auction-command/legal-completion-check.ts`, the `bid_attempt` and
`auction_command` tables in migration `20260921130000`, the Representative
controls in the live console, and `placeBidAction`.

- **Authority from the session.** The actor is the signed-in User and the Team
  must have that User as its current Representative; a forged Team, Player, or
  Organizer authority is rejected as `not_representative`. The browser never
  supplies its own authority.
- **Locking and database time.** Every live command serializes on
  `select ... from auction ... for update`. The Bid checks Lifecycle, the
  Presentation and `expectedRevision`, the deadline against PostgreSQL `now()`,
  the exact next price (`nextBidAmount`), the current leader, the Team Budget,
  the total Roster maximum, and the Tier maximum before it commits.
- **Legal Completion.** `bidKeepsLegalCompletion` simulates the winning Bid
  (Player joins the Team, amount spent, supply shrinks) and runs the same
  Simple/Tiered engine Readiness uses, so a Bid that would make any Team's legal
  finish impossible is rejected as `no_legal_completion`.
- **One winner per price.** A partial unique index on
  `(presentation_id, amount)` where the attempt is accepted, together with the
  Auction lock, guarantees one accepted price. Losing or late attempts receive
  stable reason codes; every authorized rejected attempt is preserved with its
  amount, server time, and reason.
- **Idempotency.** Each command writes a row in `auction_command` keyed by
  `(auction_id, command_id)` inside the transaction. A repeated command ID
  returns the originally stored accepted or rejected result and creates no
  second Bid, revision, or outbox event.
- **Privacy.** The shared snapshot exposes only the accepted state; rejected
  amount, time, and reason are returned to the Organizer and the submitting
  Representative only, and never enter the participant-wide outbox payload.
- **Connection state.** The console shows a Live/Reconnecting indicator and
  disables bidding once three poll intervals pass without a fresh snapshot, so a
  Representative cannot submit against state the server may already have moved
  past.

Verification: `pnpm test:db` (`tests/database/live-bidding.test.ts`: exact first
Bid and single revision, wrong amount and already-leading and stale rejections,
insufficient Budget, Roster maximum, forged Team, duplicate-command replay,
and one winner from two simultaneous equal-price Bids;
`tests/database/live-snapshot.test.ts`: rejected-Bid privacy by role and
monotonic revisions), and `pnpm test:browser`
(`tests/browser/readiness.spec.ts`: a Representative submits the exact Bid).
