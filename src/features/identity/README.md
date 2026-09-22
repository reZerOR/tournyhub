# Identity

This module owns sign-in, account settings, active-session controls, and
Auction Invitations.

`sign-in-form.tsx` supports email one-time codes and Google.
`account-settings.tsx` manages the User's display name, Google link,
recent-auth confirmation, and active sessions. Better Auth
configuration, session helpers, and OTP rate limiting live in
`src/server/auth/`.

Auction Invitations belong to a later ticket.
