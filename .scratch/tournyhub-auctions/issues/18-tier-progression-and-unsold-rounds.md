# 18: Progress Tiers and run Unsold Rounds

**What to build:** Let the Organizer finish each Tier in order and reoffer unresolved Players without changing their Starting Prices.

**Blocked by:** 11, Add Tiered Rules and Tier feasibility; 17, Pause, resume, and recover live state.

**Status:** resolved

- [x] A Tier is eligible to finish only after every available Player in it has received one completed presentation.
- [x] The Organizer cannot activate a later Tier while an Active Player remains or while the current Tier still has unoffered Players.
- [x] After a Tier finishes, the Organizer can activate the next Tier or start an Unsold Round from completed Tiers.
- [x] An Unsold Round exposes only eligible Unsold Pool Players and tracks which Players have been offered during that round.
- [x] The Organizer may run another Unsold Round without a fixed retry limit while the Auction remains legally completable.
- [x] A reoffered Player keeps the frozen Starting Price and all prior presentations and Bid attempts remain in history.
- [x] Closing an Unsold Round is blocked when unresolved minimums require the Forced Assignment or constrained matching flow.
- [x] Every Tier and Unsold Round transition creates an Audit Entry and committed revision visible to participants.
- [x] Tests cover complete and incomplete first passes, Simple Rules behavior, ordered Tier activation, repeat rounds, stale commands, and unchanged Starting Prices.

## Comments

Implemented in `src/server/auction-command/tier-progress.ts` (`activateTier`,
`startUnsoldRound`, `closeUnsoldPool`, `requestConstrainedMatching`), the
read models in `src/server/auction-query/progress.ts`, the `unsold_round` table
and `player_presentation.unsold_round_id` in migration `20260921140000`, the
Unsold-Round branch of `loadEligiblePlayers`, and the Tiers and Unsold Rounds
panel of the live console.

- **Tier progress.** `loadTierProgress` counts each Tier's biddable Players and
  how many have a completed Presentation: a Sale or an Unsold result. A returned
  Presentation does not count, because that Player is back in the queue.
  `activateTier` refuses to run while a Player is Active, while an Unsold Round
  is open, when any earlier Tier is incomplete (`tier_progress_incomplete`), and
  when the target Tier has nothing left to offer (`no_next_tier`).
- **Unsold Rounds.** A round opens only after the current offering scope is
  complete — the Active Tier under Tiered Rules, the whole queue under Simple
  Rules — and exposes only unresolved Unsold Pool Players. The round records
  its own presentations through `unsold_round_id`, so a Player already completed
  during a round is not offered again in that round. Only one round is open at a
  time, and rounds are numbered in sequence.
- **Frozen price.** A Player offered again uses the Starting Price recorded on
  its first Presentation, so a reoffer cannot change it. Every earlier
  Presentation and Bid Attempt stays in history.
- **Closing a round.** `closeUnsoldPool` marks the remaining Pool Players Final
  Unsold when every Team already meets its minimums. When exactly one deficient
  Team and one eligible Player remain it creates the Forced Assignment instead.
  When several Teams and Players remain it refuses with `matching_required`, so
  the Organizer cannot hand-pick pairings. When the round has nothing left to
  offer it closes with `round_closed` without resolving anything, which is what
  lets the Organizer open another round over the same Pool without a fixed retry
  limit.
- **Audit.** Every Tier activation, round opening, round close, forced
  assignment, and matching request writes one Audit Entry and advances the
  Auction revision by exactly one, with a matching outbox event.

Verification: `pnpm test:db`
(`tests/database/live-tier-progress.test.ts`: an incomplete first pass, an
Active-Player refusal, Organizer/unknown-Tier/stale refusals, an
already-complete Tier, ordered activation with one revision and an Audit Entry,
a round refused before the queue completes under both Rule modes, a round that
exposes and tracks only Pool Players, closing blocked with `matching_required`,
an exhausted round that closes and is followed by a second round, a frozen
Starting Price with prior Presentations preserved, and a replayed round
command).
