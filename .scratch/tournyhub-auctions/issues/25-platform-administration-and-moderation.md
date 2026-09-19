# 25: Moderate Users and Auctions

**What to build:** Give a small allowlisted Platform Administrator group the controls needed to protect the beta without power to change Auction outcomes.

**Blocked by:** 02, Add email OTP authentication and a protected shell; 04, Create the private dashboard and Draft Auction.

**Status:** ready-for-agent

- [ ] Platform Administrator status comes from an allowlisted database role that ordinary registration and Auction ownership cannot grant.
- [ ] An administrator can suspend and restore a User and revoke all of that User's active sessions.
- [ ] A suspended User cannot establish a new authenticated session or use an existing one for protected actions.
- [ ] An administrator can hide and unhide an Auction without editing or deleting its domain records.
- [ ] Protected Auction inspection requires a recent administrator authentication and a non-empty moderation reason.
- [ ] Every inspection, suspension, restoration, session revocation, hide, and unhide action creates an immutable moderation record.
- [ ] Administrator controls cannot change Organizer ownership, Teams, representatives, Rules, Player Entries, Bids, Sales, corrections, or Results.
- [ ] An administrator may still create and organize a separate Auction as an ordinary User without mixing the two authority paths.
- [ ] Authorization and browser tests cover non-administrator denial, reason requirements, session loss, hidden Auction access, audit attribution, and forbidden domain mutations.
