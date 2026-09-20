# 11: Add Tiered Rules and Tier feasibility

**What to build:** Extend setup and Legal Completion so the Organizer can balance Teams across ordered Player Tiers before starting.

**Blocked by:** 10, Configure Simple Rules and start a feasible Auction.

**Status:** resolved

- [x] The Organizer can create, rename, reorder, and remove Auction-specific Tiers before the Auction starts.
- [x] Each Tier has a positive whole-number default Starting Price plus shared minimum and maximum counts for every Team.
- [x] Every biddable Player belongs to exactly one Tier before a Tiered Auction becomes Ready.
- [x] Player Starting Price overrides remain available and cannot conflict with whole-number price rules.
- [x] Legal Completion evaluates all Teams and Tiers as one allocation problem, including preassigned Player Representatives, Budget reserves, and maximum capacity.
- [x] Tier supply that cannot meet all minimums, or cannot be distributed without exceeding a maximum, produces a linked Readiness error.
- [x] A later Tier edit that invalidates calculated Teams removes Ready status without silently deleting Teams or accepted invitations.
- [x] Starting freezes Tier order and every initial Starting Price and creates no biddable entry for Player Representatives.
- [x] Property and database tests cover multiple feasible assignments, insufficient Tier supply, Budget conflicts, capacity conflicts, overrides, and deterministic results.

## Comments

Implemented in `src/domain/tier.ts`, `src/domain/tiered-completion.ts`, the
Tiered branch of `src/domain/readiness.ts` and
`src/domain/rules.ts` (`isTieredRuleSetComplete`, `tieredRulesInputSchema`),
`src/server/auction-command/tiers.ts`, the Tiered branch of
`src/server/auction-command/rules.ts` (`saveTieredRules`),
`src/server/auction-query/tiers.ts`, the extended
`src/server/auction-query/readiness.ts` and `startAuction`, the Tiers setup page
and editor, and the `tier` table plus `player_entry.tier_id` and
`auction.active_tier_id` in migration `20260921110000`.

- **Tier feasibility engine.** Tiered Legal Completion is a second pure engine
  in `tiered-completion.ts` that treats every Team and Tier as one allocation
  problem. It rejects failed necessary conditions, searches exactly for a
  witness allocation over the cheapest Players per Tier under a fixed node
  budget, then falls back to a deterministic greedy heuristic. As with
  `legal-completion.ts`, every `possible: true` is backed by a constructed
  allocation, so Bids and starts are never gated on a completion that does not
  exist. A property test compares it to an independent brute-force search over
  400 randomized small cases.
- **Readiness.** A Tiered Auction requires complete shared Rules, at least one
  Tier, a Tier for every biddable Player, Tier minimums that fit the Roster
  maximum, and Tier maximums that can reach the Roster minimum. Readiness and
  live commands share `tieredFeasibilityIssues`, so they cannot disagree.
  `evaluateReadiness` gained a `tiers` Readiness group.
- **Start.** `startAuction` freezes Tier order and each Tier's Starting Price
  into revision 1, resolves each Player's offered price as override-or-Tier
  price, records Player Representatives as preassigned (never biddable), and
  sets `auction.active_tier_id` to the first Tier.
- **Ready invalidation.** Editing a Tier, or deleting one, returns a Ready
  Auction to Draft through `markAuctionDraft` without touching Teams or
  invitations; deleting a Tier clears `player_entry.tier_id` through
  `ON DELETE SET NULL`, which the next Readiness pass reports.

Verification: `pnpm test:unit` (`tier.test.ts`, `tiered-completion.test.ts`
including the brute-force property comparison, `tiered-readiness.test.ts`),
`pnpm test:db` (`tests/database/tiers.test.ts`: Tier CRUD and reorder,
duplicate labels, assignment round-trip, Tiered Rules persistence and Simple
refusal, Ready→Draft on an invalidating edit, frozen Tier order and prices at
start, and the unassigned-Player start block), and `pnpm test:browser`
(`tests/browser/tiers.spec.ts`: create, reorder, assign, and Tiered Rules).
