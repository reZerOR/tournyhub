# 04: Create the private dashboard and Draft Auction

**What to build:** Give an authenticated User a private dashboard and the first step of the Auction setup workflow.

**Blocked by:** 02, Add email OTP authentication and a protected shell.

**Status:** resolved

- [x] The dashboard separates Auctions the User organizes, Teams the User represents, pending invitations, and Archived Auctions.
- [x] An unrelated registered User cannot discover or open another User's Auction by listing or guessing identifiers.
- [x] Any registered User can create a Draft Auction with a required title and Game plus Simple or Tiered Rules and Manual or Timed Close.
- [x] Auction setup follows the accepted section order while allowing the Organizer to revisit sections in another order.
- [x] Setup edits autosave and show Saving, Saved, or Failed to save based on the authoritative result.
- [x] The Organizer can leave and revisit a Draft without losing committed basics.
- [x] Authorization and browser tests prove that only the Organizer can edit the Draft and that no Viewer access path exists.

## Comments

Implemented the dashboard (`src/app/app/page.tsx`) and the Draft Auction
creation + setup workflow. Mutations live in `src/server/auction-command/`,
authorized reads in `src/server/auction-query/`, shared domain types in
`src/domain/auction.ts`, and the client-facing workflow in
`src/features/auctions/setup/`, matching the module boundaries described in
their READMEs and ADR-0009. Players/Teams/Representatives/Rules/Readiness
setup sections are placeholders pending later tickets (05-11); Teams
represented and pending invitations are static empty states on the dashboard
pending tickets 07/09.
