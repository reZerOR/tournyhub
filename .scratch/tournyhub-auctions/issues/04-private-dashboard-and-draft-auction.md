# 04: Create the private dashboard and Draft Auction

**What to build:** Give an authenticated User a private dashboard and the first step of the Auction setup workflow.

**Blocked by:** 02, Add email OTP authentication and a protected shell.

**Status:** ready-for-agent

- [ ] The dashboard separates Auctions the User organizes, Teams the User represents, pending invitations, and Archived Auctions.
- [ ] An unrelated registered User cannot discover or open another User's Auction by listing or guessing identifiers.
- [ ] Any registered User can create a Draft Auction with a required title and Game plus Simple or Tiered Rules and Manual or Timed Close.
- [ ] Auction setup follows the accepted section order while allowing the Organizer to revisit sections in another order.
- [ ] Setup edits autosave and show Saving, Saved, or Failed to save based on the authoritative result.
- [ ] The Organizer can leave and revisit a Draft without losing committed basics.
- [ ] Authorization and browser tests prove that only the Organizer can edit the Draft and that no Viewer access path exists.
