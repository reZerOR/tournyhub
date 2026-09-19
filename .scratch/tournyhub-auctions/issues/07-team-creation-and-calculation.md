# 07: Create Teams and calculate feasible Team counts

**What to build:** Let the Organizer create Teams directly or calculate viable Team counts from the available Players and total Roster limits.

**Blocked by:** 05, Manage Player Entries and Custom Player Fields.

**Status:** ready-for-agent

- [ ] The Organizer can create, rename, reorder, and remove Teams while setup remains editable.
- [ ] Team names are required and unique within the Auction after normalization.
- [ ] A Team may have an optional color and validated, re-encoded image logo with a random storage key.
- [ ] Calculate Teams asks for minimum and maximum total Roster sizes and uses the current Player count and preassigned representatives.
- [ ] The calculator returns every feasible Team count plus one recommendation and explains when no feasible count exists.
- [ ] Choosing a calculated count creates editable unnamed Teams without representatives and retains the entered total Roster limits for later Rules.
- [ ] The model permits at most 32 Teams and recommends no more than 16 for the beta.
- [ ] Unit and browser tests cover boundary counts, preassignments, impossible ranges, manual edits, uniqueness, logo validation, and persistence.
