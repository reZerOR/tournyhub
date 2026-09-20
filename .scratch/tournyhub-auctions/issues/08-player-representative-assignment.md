# 08: Assign Player Representatives

**What to build:** Let the Organizer make a Player Entry the logged-in representative and preassigned Roster member of one Team.

**Blocked by:** 05, Manage Player Entries and Custom Player Fields; 07, Create Teams and calculate feasible Team counts.

**Status:** resolved

- [x] The Organizer can link an eligible registered User and Player Entry as a Player Representative for one Team.
- [x] The Player Representative begins on that Team's Roster and never enters the Player bidding queue.
- [x] The preassigned Player counts toward the Team's total Roster limits and assigned Tier limits.
- [x] One User cannot represent multiple Teams in the same Auction, and the Organizer cannot represent a Team in their own Auction.
- [x] One Player Entry cannot be preassigned to several Teams or also become available for bidding.
- [x] Changing or removing the assignment during editable setup updates Team calculation and future Readiness results.
- [x] Database and browser tests cover role uniqueness, Roster counting, bidding exclusion, authorization, and conflicting assignments.

## Comments

Implemented in `src/server/auction-command/representatives.ts`,
`src/server/auction-query/representatives.ts`, the Representatives editor, and
the `representative_user_id`/`representative_type` Team columns plus
`player_entry.team_id`/`is_representative` from migration `20260921090000`.

- Assigning sets the Team's `representative_user_id` and `representative_type`
  to `player`, and preassigns the Player Entry to that Team. A partial unique
  index on `(auction_id, representative_user_id)` enforces one Team per User,
  and `player_entry_team_id_representative_key` enforces one Player
  Representative per Team. The Organizer cannot represent a Team in their own
  Auction, and an unrelated or unverified email is rejected.
- Bidding exclusion and Roster counting are real: `loadReadinessInput` and the
  Legal Completion engine treat a preassigned Player Entry as an occupied Roster
  slot and exclude it from the available supply, so it is never offered.
- Replacing a representative clears the previous Player Entry preassignment and
  supersedes that Team's pending invitation in the same transaction, and every
  write returns a Ready Auction to Draft, so Team calculation and Readiness
  always reflect the change.
- **Tier limits:** the second half of the Tier clause applies only under Tiered
  Rules, which are ticket 11. Under Simple Rules there are no Tier limits; the
  total-Roster half is enforced now and the Tier feasibility half lands with the
  Tiered Rules slice.

Verification: `pnpm test:db` (`tests/database/representatives.test.ts`:
assignment, Organizer self-representation rejection, one-User and one-Entry
conflicts, unregistered email, replacement and invitation supersession,
removal, and the representative read model) and `pnpm test:browser`
(`tests/browser/representatives.spec.ts`: assign a registered User and see the
Player Representative persist).
