# Security and permissions

Status: Confirmed

TournyHub uses open registration but private Auction access. Knowledge of an Auction ID, URL, Team ID, or Realtime channel name never grants access.

## Permission matrix

| Action | Registered User | Organizer | Team Representative | Platform Administrator |
| --- | --- | --- | --- | --- |
| Create an Auction | Yes | Yes | Yes | Yes, as a normal User |
| View an Auction | Only if involved | Own Auction | Represented Auction | Only through recorded moderation access |
| Edit Draft setup | No | Yes | No | No |
| Submit a Bid | No | No | For own Team only | No |
| Control close, pause, tiers, corrections | No | Yes | No | No |
| View accepted live state | No | Yes | Yes | Only through recorded moderation access |
| View rejected Bid details | No | All in own Auction | Own Team's attempts | No by default |
| Export Results | No | Yes | Yes | Only through recorded moderation access |
| Suspend Users or hide Auctions | No | No | No | Yes |
| Change Auction data or outcomes | No | Yes, within lifecycle rules | Bid commands only | Never |

“Registered User” in this table means a User with no role in the target Auction. There is no Viewer role in the first version.

## Authentication baseline

Better Auth provides email OTP and Google sign-in. Passwords are disabled.

- Email OTP expires after 10 minutes and allows at most five verification attempts.
- Requesting another OTP is limited to once per 60 seconds per normalized email, with additional IP and account rate limits.
- OTP values are stored only as secure digests and never logged.
- Google sign-in may link automatically only when Google supplies the same verified email as the existing User. Other linking requires a fresh authenticated session.
- Sessions last seven days, use secure HTTP-only cookies in production, rotate or refresh according to Better Auth guidance, and can be revoked from account settings.
- Sensitive actions require recent authentication. If the session is not fresh, the User completes another OTP or Google authentication step.
- Authentication responses avoid revealing whether an email is registered.

The exact Better Auth configuration must be checked against the installed version's official documentation during implementation. Secrets use high-entropy production values and are never committed.

## Authorization rules

Every server query and command derives the User from the validated session. Actor IDs, Team ownership, Organizer ownership, and administrator status are never trusted from browser input.

Authorization must be enforced in the application command/query layer and reinforced with restrictive database access. Browser clients receive no Supabase service-role key and do not write Auction tables directly. If direct read access is used, Row Level Security policies must express the same private membership rules and have explicit tests.

Invitations are targeted to one normalized email, single-use, time-limited, and stored as token digests. Acceptance requires a verified session with the exact invited email. Issuing or accepting a newer invitation supersedes older pending invitations for that Team.

## Private Realtime access

The application server grants short-lived access only after confirming that the current User organizes or represents the Auction. Channel payloads contain only data authorized for every subscribed role. More sensitive acknowledgements, such as rejected Bid reasons, travel through the command response or a user-specific private channel.

Changing a Team Representative, transferring ownership, suspending a User, hiding an Auction, or revoking a session invalidates further grants immediately. Connected clients must lose control on the next authorization refresh and refetch after reconnect.

## Phone numbers and exports

Phone numbers are sensitive Player data.

- They are optional and absent unless the Organizer supplies them.
- They do not appear in default Player tables, the Active Player card, Realtime public payloads, platform logs, feedback, or PDF exports.
- The Organizer may view them throughout the Auction lifecycle.
- All Team Representatives may open Player details containing phone numbers while the Auction is Live or Paused.
- After completion or cancellation, a Team Representative may view phone numbers only for Players on that Team's Roster.
- The Organizer's Results CSV includes every supplied phone number. A Team Representative's Results CSV includes phone numbers only for Players on that Team's Roster. Every CSV requires an explicit export action.

CSV cells that begin with spreadsheet formula markers must be escaped. Export access is audited where it exposes phone numbers.

## Platform administration

Platform Administrator is an allowlisted database role assigned outside normal registration. Administrators can suspend Users, revoke their sessions, hide Auctions, and inspect protected Auction data only after entering a moderation reason. Inspection and moderation actions create immutable Audit Entries.

Administrators cannot become Organizer through administrator power, alter Bids or Results, edit Rules, or bypass Auction state transitions. They may still create their own Auctions as ordinary Users.

## Abuse controls

Open registration requires layered limits even for an unadvertised beta:

- Rate-limit OTP sends, OTP verification, Google callbacks, invitations, feedback, imports, and commands.
- Cap imported records, file size, worksheet count, custom-field count, and field lengths before parsing fully.
- Validate CSV and XLSX MIME type, extension, and content; reject macros and unsupported structures.
- Sanitize filenames and never serve uploaded content as executable HTML.
- Apply per-User Draft creation limits if abuse appears; the one-Live-Auction service limit remains absolute.
- Suspend abusive Users and revoke all active sessions.

Team logos, if enabled, accept only a narrow image allowlist, are decoded and re-encoded server-side, and receive random object keys. Player photos are out of scope.

## Request and browser protections

- Use Better Auth trusted origins and CSRF protections for authentication flows.
- Validate `Origin` on state-changing application requests and use same-site cookies appropriate to the deployment.
- Set Content Security Policy, frame restrictions, MIME sniffing protection, referrer policy, and a conservative permissions policy.
- Escape all Organizer-supplied names and custom values in HTML and generated exports.
- Use parameterized database access and schema validation at every network boundary.
- Do not place secrets, session tokens, OTPs, phone numbers, invitation tokens, or full Auction snapshots in URLs.

## Logging and secret handling

Vercel and Supabase logs may record request IDs, command IDs, hashed or internal User IDs, Auction IDs, status codes, latency, and stable error codes. They must redact cookies, authorization headers, OTPs, invitation tokens, email bodies, phone numbers, Player custom fields, and raw imports.

Production, preview, and development use different secrets. Supabase service-role credentials and Gmail app credentials exist only in server-side environment variables. Secret rotation requires revoking the old value and verifying sign-in, invitation, snapshot, and command paths.

## Security acceptance criteria

- An unrelated registered User cannot discover, read, subscribe to, export, or mutate an Auction by guessing identifiers.
- A former representative loses control after replacement, including from an already open tab.
- Duplicate, stale, forged, and cross-Team commands cannot alter state.
- Suspension revokes sessions and blocks new authenticated actions.
- Phone numbers never appear in unauthorized snapshots, PDFs, feedback, Realtime broadcasts, or logs.
- Administrator access always has a reason and immutable record and cannot change Auction outcomes.
