# 07: Create Teams and calculate feasible Team counts

**What to build:** Let the Organizer create Teams directly or calculate viable Team counts from the available Players and total Roster limits.

**Blocked by:** 05, Manage Player Entries and Custom Player Fields.

**Status:** resolved

- [x] The Organizer can create, rename, reorder, and remove Teams while setup remains editable.
- [x] Team names are required and unique within the Auction after normalization.
- [x] A Team may have an optional color and validated, re-encoded image logo with a random storage key.
- [x] Calculate Teams asks for minimum and maximum total Roster sizes and uses the current Player count and preassigned representatives.
- [x] The calculator returns every feasible Team count plus one recommendation and explains when no feasible count exists.
- [x] Choosing a calculated count creates editable unnamed Teams without representatives and retains the entered total Roster limits for later Rules.
- [x] The model permits at most 32 Teams and recommends no more than 16 for the beta.
- [x] Unit and browser tests cover boundary counts, preassignments, impossible ranges, manual edits, uniqueness, logo validation, and persistence.

## Comments

Implemented across `src/domain/team.ts`, `src/domain/team-calculator.ts`,
`src/domain/team-logo.ts`, `src/server/auction-command/teams.ts`,
`src/server/auction-query/teams.ts`, `src/server/storage/object-store.ts`, the
Teams setup editor, and `supabase/migrations/20260921090000_teams_representatives_and_rules.sql`.

- Names are trimmed and collapsed to single spaces on save; uniqueness uses the
  normalized form, so `"  red   comets "` collides with `"Red Comets"`. Manual
  creation and rename require a name; calculated Teams are inserted unnamed and
  become Ready only once named.
- `calculateFeasibleTeamCounts` returns the contiguous interval of counts that
  can fill every Team's minimum and hold the whole Player pool, capped at 32 and
  recommending at most 16. `applyCalculatedTeams` refuses any count outside that
  interval and stores the entered total Roster minimum and maximum in
  `auction_rule_set` for the later Rules step.
- **Logo scope:** logos are decoded and re-encoded server-side by
  `src/server/images/png.ts`, which strips every ancillary chunk, and are stored
  under a random key (`{auctionId}/{uuid}.png`) behind the `ObjectStore` seam.
  The beta accepts **PNG only** — JPEG and WebP need a codec dependency that the
  zero-cost stack does not yet carry, and the security policy's allowlist
  (JPEG, PNG, WebP) is narrowed accordingly. Bytes live in the `stored_object`
  table rather than Supabase Storage so one backup covers data and objects;
  swapping to Supabase Storage only changes the store, not the seam.

Verification: `pnpm test:unit` (calculator boundaries, name/color rules),
`pnpm test:db` (`tests/database/teams.test.ts`: uniqueness, the 32-Team cap,
reorder, delete-clears-representative, calculated limits, logo re-encode and
rejection), and `pnpm test:browser` (`tests/browser/teams.spec.ts`: create,
duplicate rejection, reorder, rename, persistence, calculator).
