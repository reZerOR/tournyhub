# Auth

Better Auth configuration (`auth.ts`), the server-side session helper
(`session.ts`), and the per-email OTP resend cooldown and rate limit
(`otp-request-log.ts`) that supplements Better Auth's IP-scoped limiter.

Email OTP is the only enabled sign-in method. Google sign-in is a later
ticket and must not weaken the checks here when it is added.
