# 19: Resolve minimums and complete the Auction

**What to build:** Resolve the remaining Unsold Pool fairly and allow completion only when every Team satisfies its required Roster minimums.

**Blocked by:** 18, Progress Tiers and run Unsold Rounds.

**Status:** resolved

- [x] If one eligible Player and one deficient eligible Team remain, closing the round creates a Forced Assignment at the Player's frozen Starting Price.
- [x] A Forced Assignment updates the Roster, Tier count, spent Credits, and remaining Credits without creating a Bid.
- [x] With several deficient Teams and Players, the Organizer can request constrained random matching instead of choosing individual pairings.
- [x] Matching considers only complete assignments that respect Budget, total and Tier minimums and maximums, and all existing Sales.
- [x] The system uses secure randomness to choose among feasible complete assignments and stores the inputs and chosen result for audit.
- [x] If every Team already meets its minimums, the Organizer can close the Unsold Pool and mark its remaining Players Final Unsold.
- [x] Completion is blocked while a Player is Active, a Tier remains unresolved, the Unsold Pool remains open, or any Team misses a required minimum.
- [x] A completed Auction becomes read-only and publishes one final authoritative Results revision.
- [x] Property, database, and browser tests cover single Forced Assignment, several feasible matchings, no feasible matching, Budget boundaries, Final Unsold, and completion guards.

## Comments

Implemented in `src/domain/matching.ts`, the forced-assignment and matching
paths of `src/server/auction-command/tier-progress.ts`, `completeAuction` in
`src/server/auction-command/lifecycle.ts`, the Results read model in
`src/server/auction-query/results.ts`, and the `resolved_at`, `resolution`, and
`sale_id` columns on `unsold_membership` in migration `20260921140000`.

- **Forced Assignment.** Closing a round with exactly one deficient Team and
  one eligible Player creates a Sale with `source = 'forced'` at the Player's
  frozen Starting Price, with no Bid Attempt. Its Presentation records
  `selection_method = 'forced'`, so it is never mistaken for an Organizer
  choice. The Roster, Tier count, spent Credits, and remaining Credits all
  follow from the committed Sale row, and the Pool membership is resolved as
  `assigned`. The assignment is refused unless the resulting Auction still has a
  Legal Completion.
- **Constrained matching.** `matchUnsoldPlayers` is a *constructive* engine: it
  emits the assignments to make, rather than a yes/no verdict. It takes the same
  inputs the Legal Completion engines take — Players with their frozen Starting
  Prices and Tier, Teams with their Budget, spend, and current Roster — applies
  the same necessary conditions, normalizes Simple Rules into a single
  Roster-shaped Tier, and decides feasibility with an exact search that only
  ever constructs an assignment it verifies. Once a completion is known to exist
  it collects several verified assignments — random shuffles plus balanced
  rotations, so the set does not depend on the randomness alone — and
  cryptographically secure randomness picks the one to apply. Nothing is
  committed from an assignment the engine did not build, and every correction
  and Forced Assignment is additionally gated by the shared
  `auctionKeepsLegalCompletion` engine, so matching can never accept what
  Readiness and Bid validation would refuse. The request stores the candidate
  Players and the chosen assignments in its Audit Entry.
- **Final Unsold.** Closing the Pool once every Team meets its minimums
  resolves every remaining membership as `final_unsold`, and the Pool stops
  counting as supply for Legal Completion.
- **Completion.** `findCompletionBlocker` checks, in order, an Active Player, an
  open Unsold Round, an unfinished Tier, an unresolved Player, an unresolved
  Pool entry, and a Team below a required minimum. Completion is deliberate, so
  the Auction must be Paused first, mirroring the documented
  `Live <-> Paused -> Completed` lifecycle; a Live Auction is refused with
  `auction_not_paused`. Completion sets `completed_at`, publishes the new
  revision's payload as one authoritative Results revision, and leaves the
  Auction read-only: the live snapshot and every live command refuse a Completed
  Auction.

**Fixed while implementing this.** The shared Legal Completion loader counted
only Player Representatives and ignored accepted Sales when it built each
Team's Roster, so any check after the first Sale over-estimated what the Team
still needed. It now counts Sales with the same union the Roster read models
use, which also makes `placeBid`'s feasibility guard accurate after a Sale.

Verification: `pnpm test:unit` (`matching.test.ts`: 400 randomized cases
compared against an independent brute-force search, a single pair, a Budget that
cannot cover the only Player, no complete assignment, several deficient Teams,
and a randomness-driven choice), `pnpm test:db`
(`tests/database/live-completion.test.ts`: one Forced Assignment at the frozen
price with no Bid Attempt and the committed Roster, spend, and remaining
Credits; several deficient Teams resolved by matching with the audit inputs and
result; a refusal when no complete assignment exists; Final Unsold; and the
completion guards for an Active Player, an unresolved Tier, an Unsold Round, an
unresolved Player, and an unmet minimum plus one published Results revision and
a read-only Auction), and `tests/browser` through the live console flows in
`live-pause.spec.ts` and `live-corrections.spec.ts`.
