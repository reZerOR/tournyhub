# 11: Add Tiered Rules and Tier feasibility

**What to build:** Extend setup and Legal Completion so the Organizer can balance Teams across ordered Player Tiers before starting.

**Blocked by:** 10, Configure Simple Rules and start a feasible Auction.

**Status:** ready-for-agent

- [ ] The Organizer can create, rename, reorder, and remove Auction-specific Tiers before the Auction starts.
- [ ] Each Tier has a positive whole-number default Starting Price plus shared minimum and maximum counts for every Team.
- [ ] Every biddable Player belongs to exactly one Tier before a Tiered Auction becomes Ready.
- [ ] Player Starting Price overrides remain available and cannot conflict with whole-number price rules.
- [ ] Legal Completion evaluates all Teams and Tiers as one allocation problem, including preassigned Player Representatives, Budget reserves, and maximum capacity.
- [ ] Tier supply that cannot meet all minimums, or cannot be distributed without exceeding a maximum, produces a linked Readiness error.
- [ ] A later Tier edit that invalidates calculated Teams removes Ready status without silently deleting Teams or accepted invitations.
- [ ] Starting freezes Tier order and every initial Starting Price and creates no biddable entry for Player Representatives.
- [ ] Property and database tests cover multiple feasible assignments, insufficient Tier supply, Budget conflicts, capacity conflicts, overrides, and deterministic results.
