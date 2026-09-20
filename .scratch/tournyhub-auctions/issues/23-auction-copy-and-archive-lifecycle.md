# 23: Copy, archive, restore, and delete Auctions

**What to build:** Let the Organizer reuse an earlier Auction safely and recover an Archived Auction during a seven-day deletion window.

**Blocked by:** 11, Add Tiered Rules and Tier feasibility; 21, Apply controlled paused changes.

**Status:** resolved

- [x] The Organizer can copy an eligible earlier Auction into a separate Draft Auction with a new identity and no effect on the source.
- [x] A copy carries Rules, Custom Player Field definitions, and only the Player Entries selected by the Organizer.
- [x] Copied Players retain names, roles, External Player IDs, phone numbers, and custom values.
- [x] The Organizer chooses whether to retain copied Tier and Starting Price values or assign them again.
- [x] User links, representatives, Teams, invitations, Bids, Sales, Forced Assignments, Results, and Audit history never copy.
- [x] The Organizer can archive a Draft, Ready, Completed, or Cancelled Auction and restore it to its prior non-live state within seven days.
- [x] Archived Auctions leave normal dashboard lists, remain visible in the archive view, and reject normal Auction commands.
- [x] After seven days, an idempotent cleanup permanently deletes eligible Auction data without a reminder email and cannot delete an Auction restored in time.
- [x] Browser and database tests cover both copy choices, source isolation, uniqueness conflicts, archive authorization, boundary timestamps, restore, and cleanup retry.

## Comments

Implemented in `src/server/auction-command/copy-auction.ts` and
`archive.ts`, the `archived_at`, `archived_previous_status`, and
`archive_deadline` columns with their guard constraint in migration
`20260922110000`, `src/server/auction-query/lifecycle.ts`, the copy form and
archive/restore controls under `src/features/auctions/lifecycle/`, and the
`/app/auctions/new` copy entry point.

- **Copy is additive only.** A new Draft is created and Rules, Custom Player
  Field definitions (with their values remapped to new field ids), and the
  selected Player Entries are inserted. Teams, representatives, invitations,
  Presentations, Bids, Sales, Forced Assignments, Results, and Audit history are
  never read, so a copy cannot carry stale authority or history. The source is
  read `for share`, so a copy cannot mix two versions of a running Auction, and
  the source's status and contents are untouched.
- **The Tier and Starting Price choice.** With `keepTierAndPrice` the Tiers are
  recreated (ids remapped), each Player keeps its Tier, and its Starting Price
  override comes across. Without it the new Auction has no Tiers and no price
  data, so Readiness asks the Organizer to assign them again. Player identities
  — display name, role, External Player ID, phone number, and custom values —
  copy either way.
- **Eligibility.** A copy source must belong to the Organizer and must not be
  Archived; a missing, unrelated, or archived source returns null so an Auction
  id cannot be used to probe another Organizer's data.
- **Archive.** Only Draft, Ready, Completed, or Cancelled Auctions may be
  archived. The status check lives in the same `for update` lock as the update,
  and database time computes the seven-day deadline. The guard constraint keeps
  `archived_at`, `archived_previous_status`, and `archive_deadline` mutually
  consistent with the status, so an Archived Auction can never hold a Live or
  Paused previous state.
- **Archived Auctions reject ordinary commands.** Setup requires Draft or
  Ready, live commands require Live or Paused, and controlled changes require
  Draft, Ready, or Paused; an Archived Auction is refused by all of them, which
  the tests assert.
- **Restore and deletion.** Restore requires an open window and returns the
  recorded previous status. `purgeExpiredArchivedAuctions` deletes only
  Archived Auctions whose deadline has passed, is idempotent, and cannot touch
  an Auction restored in time. It runs opportunistically when the dashboard
  loads; there is no reminder email.

Verification: `pnpm test:unit` (`tests/unit/lifecycle.test.ts`: archivable
states, the seven-day window, a deadline that counts as closed, copy-title
limits, and the copy schema's defaults) and `pnpm test:db`
(`tests/database/archive-lifecycle.test.ts`: a full-fidelity copy that leaves
the source and its authority behind, a copy that resets Tiers and prices,
refusals for a stranger and an Archived source, archiving that hides the
Auction and blocks its commands, restore, a Live refusal, a deadline that closes
the window, idempotent purging, and a restored Auction surviving the purge),
plus `pnpm test:browser`
(`tests/browser/archive-lifecycle.spec.ts`: copying a Draft into a new Draft
with its Players, then archiving the copy and restoring it from the dashboard).
