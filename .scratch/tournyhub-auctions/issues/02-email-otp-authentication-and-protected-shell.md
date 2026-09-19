# 02: Add email OTP authentication and a protected shell

**What to build:** Let any person register or sign in through a secure email one-time code and enter a private application shell without creating a password.

**Blocked by:** 01, Bootstrap the application and quality loop.

**Status:** ready-for-agent

- [ ] A new or returning User can request an email OTP and sign in without any password registration, sign-in, reset, or storage path.
- [ ] OTPs expire after ten minutes, allow at most five verification attempts, work once, and are stored only as secure digests.
- [ ] A User must wait at least 60 seconds before another code request for the same normalized email, with additional email and IP rate limits.
- [ ] Authentication responses do not reveal whether an email already belongs to a User, and logs contain no OTP, cookie, or email-body content.
- [ ] Authenticated sessions last seven days, use secure HTTP-only production cookies, and support explicit sign-out.
- [ ] Unauthenticated requests to private pages return to the sign-in flow without exposing protected data.
- [ ] Integration and browser tests cover successful registration, sign-in, expiry, replay, excess attempts, resend cooldown, rate limits, and protected-route denial.
