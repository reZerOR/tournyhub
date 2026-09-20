# 13: Select and reveal the Active Player

**What to build:** Let the Organizer choose or randomly select one eligible Player and reveal the committed selection to every Auction participant.

**Blocked by:** 12, Connect private live Auction snapshots.

**Status:** resolved

- [x] Only the Organizer can select a Player, and only one Player Presentation can be Active in an Auction.
- [x] Manual selection is limited to eligible unoffered Players in the Active Tier or eligible Players in the current Unsold Round.
- [x] Random Selection chooses fairly among the same eligible set and stores the selection method and result for audit.
- [x] The selected Player, Starting Price, Tier, and presentation state appear to every participant only after the transaction commits.
- [x] A randomly selected Player cannot be redrawn silently.
- [x] Before the first Bid, the Organizer can return the Active Player to the queue after supplying a reason that appears in Audit History.
- [x] After a Bid exists, returning the Player requires the later Bid-cancellation correction flow and cannot delete Bid history.
- [x] Concurrent or repeated selection commands cannot activate two Players or create duplicate presentations.
- [x] Database and browser tests cover manual and random choice, stale revisions, duplicate commands, empty queues, redraw restrictions, and shared updates.

## Comments

Implemented in `src/server/auction-command/select-player.ts` (with
`loadEligiblePlayers`), the shared `src/server/auction-command/live-command.ts`
helpers, `selectPlayerAction`/`returnPlayerAction`/`loadEligiblePlayersAction`,
the Organizer controls in the live console, and the `player_presentation` table
in migration `20260921130000`.

- **Eligibility.** `loadEligiblePlayers` returns biddable (non-representative)
  Players with no Sold or Unsold Presentation and no active Sale, limited to the
  Active Tier under Tiered Rules. Returned Presentations are eligible again.
- **Selection.** Manual selection must name an eligible Player; Random Selection
  draws uniformly from the same set using 48 bits of `crypto` entropy and records
  the method, the eligible count, and the chosen Player in an `audit_entry`.
  Both write a `player_presentation` with the resolved Starting Price and the
  Auction's Close Mode.
- **One Active Player.** A partial unique index
  (`player_presentation_active_key`) on `(auction_id)` where the state is open or
  closing, plus the Auction row lock, makes concurrent or repeated selections
  unable to activate two Players. A second selection is rejected as
  `presentation_active`; a stale `expectedRevision` is rejected as
  `stale_revision`; a duplicate command ID replays its stored result through the
  `auction_command` ledger without a second Presentation or revision.
- **Return.** Returning the unbid Active Player requires a reason (a missing or
  over-long reason is rejected as `reason_required`), is rejected (`bid_exists`)
  once any accepted Bid exists, and writes the Presentation state `returned`
  plus an `audit_entry`. It never deletes Bid history.
- **Deferred.** The "current Unsold Round" half of eligibility arrives with
  issue 18 (Tier progression and Unsold Rounds). Until an Unsold Round exists, a
  Player in the Unsold Pool stays ineligible, so no unsold Player is re-offered
  outside a round; the code returns to eligibility after a `returned`
  Presentation.

Verification: `pnpm test:db` (`tests/database/live-selection.test.ts`: manual
activation and revision, second-Active and stale rejection, non-Organizer
denial, deterministic random draw and audit, empty queue, duplicate-command
replay, return with reason and audit, and the post-Bid return block), and
`pnpm test:browser` (`tests/browser/readiness.spec.ts`: the Organizer offers a
Player and every participant sees it).
