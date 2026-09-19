# Identity

This module owns account user interfaces and Auction Invitations.

Ticket 02 adds email one-time-code sign-in (`sign-in-form.tsx`), sign-out
(`sign-out-button.tsx`), and the browser `authClient` used by both. Better
Auth configuration, session helpers, and OTP rate limiting live in
`src/server/auth/` since they are framework wiring rather than UI.

Google sign-in, account settings, and invitations belong to later tickets.
