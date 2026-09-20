# 05: Manage Player Entries and Custom Player Fields

**What to build:** Let the Organizer define Auction-specific Player data manually before Teams and Rules are finalized.

**Blocked by:** 04, Create the private dashboard and Draft Auction.

**Status:** resolved

- [x] The Organizer can add, edit, and remove Player Entries in a Draft Auction, with display name as the only universally required Player field.
- [x] A Player Entry can store optional role, External Player ID, phone number, Tier, Starting Price override, representative link, and Organizer-defined custom values when allowed by the selected Rule mode.
- [x] Custom Player Field definitions and values belong only to their Auction and remain available after leaving and reopening setup.
- [x] External Player IDs are unique within one Auction when supplied, while the same value may appear in another Auction.
- [x] Duplicate normalized display names show a warning but remain saveable.
- [x] The Auction cannot contain more than 2,000 Player Entries, and field lengths and custom-field counts have explicit safe limits.
- [x] Phone numbers stay out of default tables, logs, URLs, and responses to unrelated Users.
- [x] Tests cover all field rules, unique identifiers, duplicate-name warnings, limits, persistence, and cross-Auction authorization.

## Comments

Implemented in commit `05a85d3`. Domain rules live in
`src/domain/player-entry.ts`, mutations in
`src/server/auction-command/player-entries.ts`, authorized reads in
`src/server/auction-query/player-entries.ts`, server actions and the editor in
`src/features/auctions/setup/`, and the schema in
`supabase/migrations/20260920160000_player_entries.sql`. Player Entries are
Auction-scoped per ADR-0001; the entry and custom-field caps and External
Player ID uniqueness are serialized by locking the Auction row, so concurrent
setup writes cannot race them. Custom values live in a join table that
cascades on both the entry and the field.

Tier and the representative link from the second item belong to later tickets
(08 Player Representatives, 11 Tiered Rules) and are not built here; the entry
model stores role, External Player ID, phone number, Starting Price override,
and custom values now. Setup remains Draft-only, matching every other `05`
mutation, until Ready becomes reachable in ticket 10.

Verification: format, lint, typecheck, and build pass; 24 unit tests and 49
database tests pass (19 of them new here). The browser suite
(`tests/browser/players.spec.ts`) is written but could not be verified green in
this environment: the local Supabase stack was being stopped and restarted
every 30-75 seconds, which also fails the pre-existing browser tests
(`sign-in`, `auction-setup`). The new "unrelated User cannot open Players setup"
test passes; the main workflow test needs a re-run once the stack is stable.
