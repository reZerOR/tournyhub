# 10: Configure Simple Rules and start a feasible Auction

**What to build:** Let the Organizer configure Simple Rules, resolve Readiness errors, and start an Auction only when every Team can still complete a legal Roster.

**Blocked by:** 08, Assign Player Representatives; 09, Invite Outside Representatives.

**Status:** resolved

- [x] The Organizer can set an equal positive whole-number Budget, one positive whole-number Bid Increment, total Roster minimum and maximum, and a default Starting Price with optional Player overrides.
- [x] Every Team receives the same Budget and constraints, and minimum values cannot exceed maximum values.
- [x] One deterministic Legal Completion engine evaluates Player supply, preassigned representatives, capacity, Starting Prices, and Team Budget.
- [x] Readiness groups actionable errors by Teams, Players, Rules, invitations, and feasibility and links to the affected setup record.
- [x] Ready is derived from current data and returns to Draft when a later edit makes setup invalid.
- [x] The Organizer can start without representative approval and receives a warning when any representative is disconnected.
- [x] Starting is blocked if another Auction is Live, fewer than two Teams exist, a representative is missing, data is invalid, or no Legal Completion exists.
- [x] Starting freezes initial prices and creates the first immutable Auction revision without offering a Player automatically.
- [x] Unit, property, database, and browser tests cover valid and impossible allocations, integer validation, disconnected representatives, stale starts, and the one-Live-Auction limit.

## Comments

Implemented in `src/domain/rules.ts`, `src/domain/legal-completion.ts`,
`src/domain/readiness.ts`, `src/server/auction-command/rules.ts`,
`src/server/auction-command/readiness.ts`,
`src/server/auction-command/start-auction.ts`,
`src/server/auction-query/readiness.ts`, the Rules and Readiness editors, and the
`auction_rule_set`, `auction_revision`, and `auction.revision` schema.

- Rules are whole positive integers with a minimum not above the maximum; the
  Starting Price defaults Auction-wide and each Player Entry may override it.
  `auction_rule_set` holds one row per Auction, so every Team shares it.
- **Legal Completion:** deciding whether the remaining Players can fill every
  Team's minimum without breaching capacity or Budget is multiway number
  partitioning, which is NP-hard (three-partition), so no fast exact algorithm
  exists. The engine rejects necessary-condition failures, searches exactly for
  a witness allocation over the cheapest Players under a fixed node budget, and
  falls back to two deterministic heuristics. Every `possible: true` is backed
  by a constructed allocation, so a Bid or start is never gated on a completion
  that does not exist; the cost of the node budget is that an unusually tight
  large Auction can be reported impossible, which the Organizer fixes by raising
  Budgets or lowering Starting Prices.
- Readiness is derived, not stored as an unchecked flag: opening the Readiness
  page recomputes it and records Draft↔Ready, and every setup write (`player`,
  `import`, `team`, `representative`, `rule`) returns a Ready Auction to Draft.
- Starting locks the Auction, requires a strictly Ready snapshot, blocks when
  another Auction is Live (also enforced by a partial unique index on the one
  Live Auction), and writes the first immutable `auction_revision` snapshot that
  freezes every Player's resolved Starting Price before moving to Live. It
  offers no Player. Representatives with no active session are counted as
  disconnected and shown as a warning, never a blocker.

Verification: `pnpm test:unit` (`legal-completion.test.ts` including a
250-case brute-force property comparison, `readiness.test.ts`, `rules.test.ts`),
`pnpm test:db` (`tests/database/rules-readiness-start.test.ts`: rule validation,
grouped Readiness, Draft↔Ready derivation, start blocking, frozen revision
prices, the one-Live-Auction limit, and a stale-Auction start), and
`pnpm test:browser` (`tests/browser/readiness.spec.ts`: full setup, Readiness
gating, and start).
