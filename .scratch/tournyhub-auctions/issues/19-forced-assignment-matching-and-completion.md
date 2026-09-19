# 19: Resolve minimums and complete the Auction

**What to build:** Resolve the remaining Unsold Pool fairly and allow completion only when every Team satisfies its required Roster minimums.

**Blocked by:** 18, Progress Tiers and run Unsold Rounds.

**Status:** ready-for-agent

- [ ] If one eligible Player and one deficient eligible Team remain, closing the round creates a Forced Assignment at the Player's frozen Starting Price.
- [ ] A Forced Assignment updates the Roster, Tier count, spent Credits, and remaining Credits without creating a Bid.
- [ ] With several deficient Teams and Players, the Organizer can request constrained random matching instead of choosing individual pairings.
- [ ] Matching considers only complete assignments that respect Budget, total and Tier minimums and maximums, and all existing Sales.
- [ ] The system uses secure randomness to choose among feasible complete assignments and stores the inputs and chosen result for audit.
- [ ] If every Team already meets its minimums, the Organizer can close the Unsold Pool and mark its remaining Players Final Unsold.
- [ ] Completion is blocked while a Player is Active, a Tier remains unresolved, the Unsold Pool remains open, or any Team misses a required minimum.
- [ ] A completed Auction becomes read-only and publishes one final authoritative Results revision.
- [ ] Property, database, and browser tests cover single Forced Assignment, several feasible matchings, no feasible matching, Budget boundaries, Final Unsold, and completion guards.
