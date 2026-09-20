# 21: Apply controlled paused changes

**What to build:** Let the Organizer make the approved personnel, Budget, Rule, ownership, and cancellation changes without invalidating accepted Auction history.

**Blocked by:** 09, Invite Outside Representatives; 11, Add Tiered Rules and Tier feasibility; 20, Cancel Bids and reverse Sales.

**Status:** resolved

- [x] The Organizer can replace a Team Representative during Draft, Ready, or Paused state, and the former representative immediately loses command and subscription authority.
- [x] A replacement representative follows the same one-Team-per-User, exact-email invitation, and Organizer separation rules as initial assignment.
- [x] The Organizer can transfer ownership during Draft, Ready, or Paused state to an eligible registered User who represents no Team in the Auction.
- [x] While Paused, the Organizer can increase every Team's Budget by the same whole-number amount but cannot decrease Budget or change one Team differently.
- [x] While Paused, the Organizer can add Players only to unopened Tiers and cannot change a Starting Price after bidding has begun.
- [x] Rule changes cannot move Sold Players between Tiers, lower a maximum below a current count, alter completed Sales, or remove Legal Completion.
- [x] A Live Auction can be cancelled only while Paused, after which it becomes permanently read-only and cannot resume.
- [x] Every accepted change records an immutable Audit Entry and participant announcement; invalid attempts commit no partial changes.
- [x] Integration and browser tests cover lost authority, ownership conflicts, equal Budget changes, forbidden edits, feasibility rollback, cancellation, and concurrent commands.

## Comments

Implemented in `src/server/auction-command/paused-changes.ts` (`replaceTeamRepresentative`,
`transferOwnership`, `increaseTeamBudgets`, `addPausedPlayerEntries`,
`changePausedConstraints`, `cancelLiveAuction`), the `cancelled_at`,
`cancelled_reason`, and `ownership_transferred_at` columns plus their guards in
migration `20260922100000`, `src/server/auction-query/manage.ts`, and the
Organizer's Manage Auction page at `/app/auctions/[id]/manage`.

- **Shared prelude.** Every controlled change opens the same way: lock the
  Auction, confirm the Organizer, replay a stored command ID, require a state in
  which the change is allowed, require the expected revision, and require a
  reason of at most 200 characters. A Live Auction is never allowed, so a
  controlled change cannot race bidding; the command reports `auction_not_paused`
  rather than silently applying.
- **One commit path.** `commitChange` writes the Audit Entry and the idempotency
  ledger for every accepted change. A Paused Auction additionally advances the
  monotonic revision and writes one outbox announcement; a Draft or Ready Auction
  has no participants to notify, so it returns to Draft instead. An invalid
  attempt rolls back before any of this, so no partial change and no revision
  escapes.
- **Representative replacement.** The replacement must be a registered, verified
  User whose normalized email matches exactly, must not represent another Team,
  and cannot be the Organizer. Authority is derived from `team.representative_user_id`,
  so both `placeBid` and `grantRealtimeAccess` refuse the former representative
  the moment the change commits — no separate revocation step exists to forget.
  Accepting an Outside Representative invitation is now allowed while Paused for
  the same reason.
- **Budget increase.** Only the shared `auction_rule_set.budget` moves, by a
  positive whole number, so every Team changes by the same amount. There is no
  path that decreases a Budget or changes one Team alone.
- **Adding Players.** Under Tiered Rules each new Player must name a Tier that
  has never been presented; "opened" is any Presentation for that Tier
  (`loadOpenedTierIds`), not only a completed one, so adding to a Tier mid-offer
  is refused. Simple Rules refuse a Tier outright. No Starting Price can be
  supplied, so a price cannot change after bidding has begun.
- **Constraint changes.** Only total and Tier minimums and maximums move. A
  maximum cannot drop below the highest current Team count, a minimum cannot
  exceed its maximum, and the change is re-checked with the shared Legal
  Completion engine and rolled back with `no_legal_completion` when it would make
  a legal finish impossible. Sold Players are never reassigned between Tiers
  because no command exposes Tier membership.
- **Cancellation.** Requires Paused, sets `cancelled_at`/`cancelled_reason`, and
  closes any Active Presentation as returned to the queue rather than selling it.
  A database check constraint keeps `cancelled` mutually exclusive with
  `live`/`paused`, so a cancelled Auction can never resume.

Verification: `pnpm test:db` (`tests/database/paused-changes.test.ts`: authority
handover to the replacement and refusal for the former representative, one-Team
and Organizer separation, ownership transfer to an eligible User with the former
Organizer losing control, an equal Budget increase with its announcement, adding
Players to an unopened Tier and refusing an opened one, a Simple-Rules Tier
refusal, a maximum below a current count, a feasibility rollback, and a
cancellation that leaves every later command refused) and `pnpm test:browser`
(`tests/browser/paused-changes.spec.ts`: replacing a representative while Paused
and the former console losing access, plus an equal Budget increase visible on
the console and a permanent cancellation).
