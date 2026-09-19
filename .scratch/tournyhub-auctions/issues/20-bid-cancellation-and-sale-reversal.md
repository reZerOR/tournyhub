# 20: Cancel Bids and reverse Sales

**What to build:** Let the Organizer correct accepted live outcomes while Paused without deleting or rewriting Auction history.

**Blocked by:** 17, Pause, resume, and recover live state; 18, Progress Tiers and run Unsold Rounds.

**Status:** ready-for-agent

- [ ] Only the Organizer can cancel the current highest Bid, and only while the Auction is Paused.
- [ ] Cancellation marks the accepted Bid cancelled, records the reason, and restores the preceding valid Bid or Starting Price.
- [ ] Every prior Bid attempt remains immutable and inspectable after cancellation.
- [ ] Only the Organizer can reverse a completed Sale, and only while Paused and before Auction completion or cancellation.
- [ ] Sale Reversal creates a compensating record, refunds the Team, removes the active Roster assignment, and returns the Player to the Unsold Pool.
- [ ] Cancellation and reversal are rejected when the resulting Auction has no Legal Completion or conflicts with another committed correction.
- [ ] Each correction records the responsible User, database time, reason, safe before and after details, and a participant announcement.
- [ ] Concurrent correction requests serialize under the Auction command lock and cannot duplicate refunds, Roster removals, or revisions.
- [ ] Integration and browser tests cover all restored states, audit visibility, invalid lifecycle, feasibility failure, idempotent retry, and correction races.
