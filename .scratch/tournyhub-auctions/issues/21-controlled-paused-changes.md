# 21: Apply controlled paused changes

**What to build:** Let the Organizer make the approved personnel, Budget, Rule, ownership, and cancellation changes without invalidating accepted Auction history.

**Blocked by:** 09, Invite Outside Representatives; 11, Add Tiered Rules and Tier feasibility; 20, Cancel Bids and reverse Sales.

**Status:** ready-for-agent

- [ ] The Organizer can replace a Team Representative during Draft, Ready, or Paused state, and the former representative immediately loses command and subscription authority.
- [ ] A replacement representative follows the same one-Team-per-User, exact-email invitation, and Organizer separation rules as initial assignment.
- [ ] The Organizer can transfer ownership during Draft, Ready, or Paused state to an eligible registered User who represents no Team in the Auction.
- [ ] While Paused, the Organizer can increase every Team's Budget by the same whole-number amount but cannot decrease Budget or change one Team differently.
- [ ] While Paused, the Organizer can add Players only to unopened Tiers and cannot change a Starting Price after bidding has begun.
- [ ] Rule changes cannot move Sold Players between Tiers, lower a maximum below a current count, alter completed Sales, or remove Legal Completion.
- [ ] A Live Auction can be cancelled only while Paused, after which it becomes permanently read-only and cannot resume.
- [ ] Every accepted change records an immutable Audit Entry and participant announcement; invalid attempts commit no partial changes.
- [ ] Integration and browser tests cover lost authority, ownership conflicts, equal Budget changes, forbidden edits, feasibility rollback, cancellation, and concurrent commands.
