# 14: Submit authoritative Bids

**What to build:** Let each Team Representative submit the exact next Bid and receive a committed authoritative result under contention.

**Blocked by:** 13, Select and reveal the Active Player.

**Status:** ready-for-agent

- [ ] The representative console shows the Active Player, price, leader, exact next Bid, remaining Budget, reserved Credits, Roster capacity, Tier capacity, and connection state.
- [ ] A Bid command includes a unique command ID, expected Auction revision, Active Player, Team, and exact offered amount.
- [ ] The server derives the actor and represented Team from the session and rejects forged Team, Player, or Organizer authority.
- [ ] PostgreSQL locks the relevant Auction state and uses database time before checking lifecycle, presentation, deadline, price, current leader, Budget, total maximum, and Tier maximum.
- [ ] The shared Legal Completion engine rejects a Bid that would prevent any required final allocation or leave insufficient reserved Credits.
- [ ] The first valid simultaneous transaction for one price wins, and every other attempt receives a stable private rejection.
- [ ] Repeating a command ID returns its original result without creating a second Bid, revision, or distribution event.
- [ ] The submitting UI remains pending until commit and never displays an uncommitted Bid as accepted.
- [ ] Accepted Bids are visible to participants after commit, while rejected amount, time, and reason remain visible only to the Organizer and submitting representative.
- [ ] Integration and browser tests cover all rejection reasons, simultaneous Bids, stale state, forged inputs, response loss and retry, and monotonic revisions.
