# 25: Moderate Users and Auctions

**What to build:** Give a small allowlisted Platform Administrator group the controls needed to protect the beta without power to change Auction outcomes.

**Blocked by:** 02, Add email OTP authentication and a protected shell; 04, Create the private dashboard and Draft Auction.

**Status:** resolved

- [x] Platform Administrator status comes from an allowlisted database role that ordinary registration and Auction ownership cannot grant.
- [x] An administrator can suspend and restore a User and revoke all of that User's active sessions.
- [x] A suspended User cannot establish a new authenticated session or use an existing one for protected actions.
- [x] An administrator can hide and unhide an Auction without editing or deleting its domain records.
- [x] Protected Auction inspection requires a recent administrator authentication and a non-empty moderation reason.
- [x] Every inspection, suspension, restoration, session revocation, hide, and unhide action creates an immutable moderation record.
- [x] Administrator controls cannot change Organizer ownership, Teams, representatives, Rules, Player Entries, Bids, Sales, corrections, or Results.
- [x] An administrator may still create and organize a separate Auction as an ordinary User without mixing the two authority paths.
- [x] Authorization and browser tests cover non-administrator denial, reason requirements, session loss, hidden Auction access, audit attribution, and forbidden domain mutations.

## Comments

Implemented in `src/server/auction-command/administration.ts`, the
`platform_administrator`, `user_suspension`, and `moderation_access_entry`
tables plus the `auction.hidden_at` columns in migration `20260922130000`,
`src/server/auction-query/administration.ts`, the administration pages under
`/app/admin`, and `scripts/bootstrap-administrator.ts` (`pnpm admin:bootstrap`).

- **Allowlisted role.** Administrator status is a row in
  `platform_administrator`, read from the database on every request. Ordinary
  registration cannot create it: the bootstrap command refuses to run once any
  administrator exists, so the temporary `PLATFORM_ADMIN_BOOTSTRAP_EMAIL` value
  works exactly once.
- **Suspension ends access.** Suspending writes an active suspension and deletes
  every session row in one transaction. `getCurrentSession` now returns null for
  a suspended User, so every page and action that already treats null as "sign
  in" refuses the account without needing its own check, and the auth middleware
  refuses the authentication endpoints too. The restorer always implies a
  restore time; the reverse is not required, because deleting the administrator
  who lifted a suspension clears `restored_by_user_id` while `restored_at` still
  proves the restore happened.
- **Hiding is not editing.** The hidden flag is enforced in the shared
  authorization helpers — `isEditableAuction`, `lockEditableAuction`,
  `resolveLiveRole`, `getLiveSnapshot`, `resolveResultsCaller`,
  `getResultsForCaller`, `getAuctionManagementForOrganizer`, the copy sources,
  the dashboard lists, the Team logo route, and invitation acceptance — so a
  hidden Auction becomes unreadable and uncontrollable while every Team, Player,
  Bid, Sale, and Audit Entry stays exactly as it was. The test asserts the
  counts and revision are unchanged.
- **Reason gating and attribution.** Every moderation command requires a reason
  of at most 200 characters and writes an immutable `moderation_access_entry`
  before returning. Inspection records the reason and only then reads the
  summary, so an inspection can never be unattributed.
- **No authority over outcomes.** The administration module contains no command
  that writes a Team, representative, Rule, Player Entry, Bid, Sale, or Result,
  and the summary it returns names counts and lifecycle only — no Roster, price,
  phone number, or credential. An administrator can still own an Auction as an
  ordinary Organizer, which the tests cover.

Verification: `pnpm test:unit` (`tests/unit/administration.test.ts`: reason
requirements, both action schemas, the moderation vocabulary, and the bootstrap
variable name) and `pnpm test:db`
(`tests/database/administration.test.ts`: every action refused for a
non-administrator, suspension revoking sessions and recording its reason,
restore, session revocation alone, hiding that removes access while leaving
counts and revision intact, a Live Auction hidden from its Organizer and
Representatives including the Realtime grant, a reason-gated inspection,
bootstrap succeeding once and refusing a second, and an administrator owning an
Auction normally), plus `pnpm test:browser`
(`tests/browser/administration.spec.ts`: a non-administrator denied, a
suspended User signed out, a hidden Auction denied to its Organizer, a recorded
inspection, and unhiding restoring access).
