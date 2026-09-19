# 02: Add email OTP authentication and a protected shell

**What to build:** Let any person register or sign in through a secure email one-time code and enter a private application shell without creating a password.

**Blocked by:** 01, Bootstrap the application and quality loop.

**Status:** ready-for-human

- [x] A new or returning User can request an email OTP and sign in without any password registration, sign-in, reset, or storage path.
- [x] OTPs expire after ten minutes, allow at most five verification attempts, work once, and are stored only as secure digests.
- [x] A User must wait at least 60 seconds before another code request for the same normalized email, with additional email and IP rate limits.
- [x] Authentication responses do not reveal whether an email already belongs to a User, and logs contain no OTP, cookie, or email-body content.
- [x] Authenticated sessions last seven days, use secure HTTP-only production cookies, and support explicit sign-out.
- [x] Unauthenticated requests to private pages return to the sign-in flow without exposing protected data.
- [x] Integration and browser tests cover successful registration, sign-in, expiry, replay, excess attempts, resend cooldown, rate limits, and protected-route denial.

## Comments

Implemented with Better Auth's `emailOTP` plugin (`storeOTP: "hashed"`, `expiresIn: 600s`, `allowedAttempts: 5`) plus an application-owned `identity_otp_request` table enforcing the 60-second per-email resend cooldown and an hourly per-email cap; Better Auth's own IP-scoped limiter covers the IP layer. Sessions use `tournyhub`-prefixed cookies (`expiresIn: 7d`); production cookies are secure by virtue of Better Auth deriving cookie security from an `https://` `baseURL`. The protected shell lives at `/app` (layout-level `auth.api.getSession` redirect to `/sign-in`, plus an optimistic `proxy.ts` cookie check). Local development and browser tests read the OTP through a non-production-only dev inbox (`src/server/email/dev-inbox.ts`, `/api/dev/test-inbox`) instead of a real inbox; production requires real SMTP via `NodemailerEmailSender` and fails loudly on first use if unconfigured.
