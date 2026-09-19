# 05: Manage Player Entries and Custom Player Fields

**What to build:** Let the Organizer define Auction-specific Player data manually before Teams and Rules are finalized.

**Blocked by:** 04, Create the private dashboard and Draft Auction.

**Status:** ready-for-agent

- [ ] The Organizer can add, edit, and remove Player Entries in a Draft Auction, with display name as the only universally required Player field.
- [ ] A Player Entry can store optional role, External Player ID, phone number, Tier, Starting Price override, representative link, and Organizer-defined custom values when allowed by the selected Rule mode.
- [ ] Custom Player Field definitions and values belong only to their Auction and remain available after leaving and reopening setup.
- [ ] External Player IDs are unique within one Auction when supplied, while the same value may appear in another Auction.
- [ ] Duplicate normalized display names show a warning but remain saveable.
- [ ] The Auction cannot contain more than 2,000 Player Entries, and field lengths and custom-field counts have explicit safe limits.
- [ ] Phone numbers stay out of default tables, logs, URLs, and responses to unrelated Users.
- [ ] Tests cover all field rules, unique identifiers, duplicate-name warnings, limits, persistence, and cross-Auction authorization.
