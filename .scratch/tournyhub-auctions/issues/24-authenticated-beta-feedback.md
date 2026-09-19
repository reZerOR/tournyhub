# 24: Collect authenticated beta feedback

**What to build:** Let an authenticated User report a beta problem without attaching protected Auction data.

**Blocked by:** 04, Create the private dashboard and Draft Auction.

**Status:** ready-for-agent

- [ ] An authenticated User can submit a feedback category and message from any main application page.
- [ ] The application records the current page, internal User identifier, category, message, and server timestamp.
- [ ] Submission never attaches a full Auction snapshot, phone numbers, OTPs, session values, invitation tokens, or browser credentials.
- [ ] Message length, submission frequency, and accepted categories have explicit limits with accessible error feedback.
- [ ] An unauthenticated User cannot submit or enumerate feedback records.
- [ ] Successful and failed submission states do not reveal internal database or service details.
- [ ] Route and browser tests cover valid submission, limits, rate limiting, redaction, authentication, and failure recovery.
