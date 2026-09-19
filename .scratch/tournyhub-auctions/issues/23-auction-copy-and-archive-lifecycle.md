# 23: Copy, archive, restore, and delete Auctions

**What to build:** Let the Organizer reuse an earlier Auction safely and recover an Archived Auction during a seven-day deletion window.

**Blocked by:** 11, Add Tiered Rules and Tier feasibility; 21, Apply controlled paused changes.

**Status:** ready-for-agent

- [ ] The Organizer can copy an eligible earlier Auction into a separate Draft Auction with a new identity and no effect on the source.
- [ ] A copy carries Rules, Custom Player Field definitions, and only the Player Entries selected by the Organizer.
- [ ] Copied Players retain names, roles, External Player IDs, phone numbers, and custom values.
- [ ] The Organizer chooses whether to retain copied Tier and Starting Price values or assign them again.
- [ ] User links, representatives, Teams, invitations, Bids, Sales, Forced Assignments, Results, and Audit history never copy.
- [ ] The Organizer can archive a Draft, Ready, Completed, or Cancelled Auction and restore it to its prior non-live state within seven days.
- [ ] Archived Auctions leave normal dashboard lists, remain visible in the archive view, and reject normal Auction commands.
- [ ] After seven days, an idempotent cleanup permanently deletes eligible Auction data without a reminder email and cannot delete an Auction restored in time.
- [ ] Browser and database tests cover both copy choices, source isolation, uniqueness conflicts, archive authorization, boundary timestamps, restore, and cleanup retry.
