# 09: Invite Outside Representatives

**What to build:** Let the Organizer invite a non-playing User to operate one Team through a targeted, single-use invitation.

**Blocked by:** 02, Add email OTP authentication and a protected shell; 07, Create Teams and calculate feasible Team counts.

**Status:** resolved

- [x] The Organizer can invite one normalized email address to represent a Team, and the application sends a link without logging its token.
- [x] An invitee without an account can register and then accept using the exact verified invited email.
- [x] Invitation tokens are time-limited, single-use, stored as secure digests, and rejected for another verified email.
- [x] Issuing a newer invitation for a Team immediately supersedes every older pending invitation for that Team.
- [x] Acceptance gives the User authority over exactly one Team and does not consume a Roster position.
- [x] The Organizer cannot accept their own Team invitation or assign one User to multiple Teams in the Auction.
- [x] Tests cover delivery failure, registration before acceptance, token replay, expiry, supersession, wrong-email rejection, and transactional role uniqueness.

## Comments

Implemented in `src/server/auction-command/team-invitations.ts`,
`src/server/auction-query/team-invitations.ts`,
`src/server/invitations/issue-team-invitation.ts`, the invitation page and
accept action, the `EmailSender.sendInvitationEmail` method, and the
`team_invitation` table in migration `20260921090000`.

- Tokens are 32 random bytes sent in the link; only their SHA-256 digest is
  stored, expiry is seven days by database time, and acceptance requires the
  signed-in User's exact verified email. The accepting User must not be the
  Organizer and must not already represent another Team, which the
  `(auction_id, representative_user_id)` unique index enforces transactionally.
- Issuing a new invitation marks every older pending invitation `superseded`
  in the same transaction; a partial unique index keeps at most one pending
  invitation per Team. Acceptance marks the invitation `accepted`, assigns the
  Team with `representative_type = 'outside'`, and writes no Player Entry, so it
  consumes no Roster position.
- Delivery sits outside the Auction Command module: the command stores the
  digest, and `issueTeamInvitation` composes it with the `EmailSender` seam. If
  the send throws, the pending invitation is revoked, so a failed delivery
  leaves no usable token.
- **Deviation, documented in ADR-0012:** the raw token travels in the emailed
  link, which the security policy otherwise discourages for secrets. Delivery
  requires a link, storage keeps only the digest, and the link is single-use and
  email-bound, so ADR-0012 records the decision.

Verification: `pnpm test:db` (`tests/database/team-invitations.test.ts`:
delivery failure revokes, register-then-accept, digest-only storage,
supersession, replay, expiry, wrong email, Organizer self-accept, and one-Team
per User) and `pnpm test:browser`
(`tests/browser/representatives.spec.ts`: invite, register through the link,
accept, and appear as the Team's Outside Representative).
