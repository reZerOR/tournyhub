# 08: Assign Player Representatives

**What to build:** Let the Organizer make a Player Entry the logged-in representative and preassigned Roster member of one Team.

**Blocked by:** 05, Manage Player Entries and Custom Player Fields; 07, Create Teams and calculate feasible Team counts.

**Status:** ready-for-agent

- [ ] The Organizer can link an eligible registered User and Player Entry as a Player Representative for one Team.
- [ ] The Player Representative begins on that Team's Roster and never enters the Player bidding queue.
- [ ] The preassigned Player counts toward the Team's total Roster limits and assigned Tier limits.
- [ ] One User cannot represent multiple Teams in the same Auction, and the Organizer cannot represent a Team in their own Auction.
- [ ] One Player Entry cannot be preassigned to several Teams or also become available for bidding.
- [ ] Changing or removing the assignment during editable setup updates Team calculation and future Readiness results.
- [ ] Database and browser tests cover role uniqueness, Roster counting, bidding exclusion, authorization, and conflicting assignments.
