# 13: Select and reveal the Active Player

**What to build:** Let the Organizer choose or randomly select one eligible Player and reveal the committed selection to every Auction participant.

**Blocked by:** 12, Connect private live Auction snapshots.

**Status:** ready-for-agent

- [ ] Only the Organizer can select a Player, and only one Player Presentation can be Active in an Auction.
- [ ] Manual selection is limited to eligible unoffered Players in the Active Tier or eligible Players in the current Unsold Round.
- [ ] Random Selection chooses fairly among the same eligible set and stores the selection method and result for audit.
- [ ] The selected Player, Starting Price, Tier, and presentation state appear to every participant only after the transaction commits.
- [ ] A randomly selected Player cannot be redrawn silently.
- [ ] Before the first Bid, the Organizer can return the Active Player to the queue after supplying a reason that appears in Audit History.
- [ ] After a Bid exists, returning the Player requires the later Bid-cancellation correction flow and cannot delete Bid history.
- [ ] Concurrent or repeated selection commands cannot activate two Players or create duplicate presentations.
- [ ] Database and browser tests cover manual and random choice, stale revisions, duplicate commands, empty queues, redraw restrictions, and shared updates.
