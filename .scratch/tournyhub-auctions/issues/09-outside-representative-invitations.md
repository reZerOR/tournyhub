# 09: Invite Outside Representatives

**What to build:** Let the Organizer invite a non-playing User to operate one Team through a targeted, single-use invitation.

**Blocked by:** 02, Add email OTP authentication and a protected shell; 07, Create Teams and calculate feasible Team counts.

**Status:** ready-for-agent

- [ ] The Organizer can invite one normalized email address to represent a Team, and the application sends a link without logging its token.
- [ ] An invitee without an account can register and then accept using the exact verified invited email.
- [ ] Invitation tokens are time-limited, single-use, stored as secure digests, and rejected for another verified email.
- [ ] Issuing a newer invitation for a Team immediately supersedes every older pending invitation for that Team.
- [ ] Acceptance gives the User authority over exactly one Team and does not consume a Roster position.
- [ ] The Organizer cannot accept their own Team invitation or assign one User to multiple Teams in the Auction.
- [ ] Tests cover delivery failure, registration before acceptance, token replay, expiry, supersession, wrong-email rejection, and transactional role uniqueness.
