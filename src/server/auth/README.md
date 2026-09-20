# Auth

Better Auth configuration (`auth.ts`), the server-side session helper
(`session.ts`), and the per-email OTP resend cooldown and rate limit
(`otp-request-log.ts`) that supplements Better Auth's IP-scoped limiter.

Email OTP and Google are the only sign-in methods. Google implicit linking
requires the same verified email. Manual link changes and session revocation
require a session created within the last ten minutes. Sessions stay
database-backed so revocation takes effect on the next request.
