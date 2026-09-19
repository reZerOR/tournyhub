# 10: Configure Simple Rules and start a feasible Auction

**What to build:** Let the Organizer configure Simple Rules, resolve Readiness errors, and start an Auction only when every Team can still complete a legal Roster.

**Blocked by:** 08, Assign Player Representatives; 09, Invite Outside Representatives.

**Status:** ready-for-agent

- [ ] The Organizer can set an equal positive whole-number Budget, one positive whole-number Bid Increment, total Roster minimum and maximum, and a default Starting Price with optional Player overrides.
- [ ] Every Team receives the same Budget and constraints, and minimum values cannot exceed maximum values.
- [ ] One deterministic Legal Completion engine evaluates Player supply, preassigned representatives, capacity, Starting Prices, and Team Budget.
- [ ] Readiness groups actionable errors by Teams, Players, Rules, invitations, and feasibility and links to the affected setup record.
- [ ] Ready is derived from current data and returns to Draft when a later edit makes setup invalid.
- [ ] The Organizer can start without representative approval and receives a warning when any representative is disconnected.
- [ ] Starting is blocked if another Auction is Live, fewer than two Teams exist, a representative is missing, data is invalid, or no Legal Completion exists.
- [ ] Starting freezes initial prices and creates the first immutable Auction revision without offering a Player automatically.
- [ ] Unit, property, database, and browser tests cover valid and impossible allocations, integer validation, disconnected representatives, stale starts, and the one-Live-Auction limit.
