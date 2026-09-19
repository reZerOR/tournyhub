# 03: Add Google sign-in and account controls

**What to build:** Let a User sign in through Google, manage personal preferences, and inspect or revoke active sessions.

**Blocked by:** 02, Add email OTP authentication and a protected shell.

**Status:** ready-for-agent

- [ ] A new User can register through Google and a returning User can sign in through Google.
- [ ] Google links automatically only when it supplies the same verified email as the existing User, without creating a duplicate identity.
- [ ] Any other account-link change requires a recent authenticated session and cannot be initiated by an unrelated User.
- [ ] A User can update a required display name plus light or dark appearance and sound preferences, and those settings persist across sessions.
- [ ] A User can list active sessions, revoke another session, and sign out every session except or including the current one as selected.
- [ ] A revoked session loses protected access on its next request and cannot refresh itself.
- [ ] Integration and browser tests cover Google callback failures, verified-email linking, preference persistence, recent-auth checks, and session revocation.
