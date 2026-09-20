# 24: Collect authenticated beta feedback

**What to build:** Let an authenticated User report a beta problem without attaching protected Auction data.

**Blocked by:** 04, Create the private dashboard and Draft Auction.

**Status:** resolved

- [x] An authenticated User can submit a feedback category and message from any main application page.
- [x] The application records the current page, internal User identifier, category, message, and server timestamp.
- [x] Submission never attaches a full Auction snapshot, phone numbers, OTPs, session values, invitation tokens, or browser credentials.
- [x] Message length, submission frequency, and accepted categories have explicit limits with accessible error feedback.
- [x] An unauthenticated User cannot submit or enumerate feedback records.
- [x] Successful and failed submission states do not reveal internal database or service details.
- [x] Route and browser tests cover valid submission, limits, rate limiting, redaction, authentication, and failure recovery.

## Comments

Implemented in `src/domain/feedback.ts` (categories, limits, and validation),
`src/server/auction-command/feedback.ts` (`submitFeedback`), the
`feedback` table in migration `20260922120000`, the `FeedbackForm` in the
application-shell footer plus the `/app/feedback` route, and
`src/features/feedback/feedback-actions.ts`.

- **Reachable from every page.** The form lives in a collapsed `Beta feedback`
  section of the authenticated shell footer, so it is available on every main
  page without navigating away. It reports the path it was opened on, taken
  from the URL rather than typed.
- **No protected data by construction.** The submitted shape is exactly
  category, message, and page. The table has no column for an Auction, Team,
  snapshot, phone number, or credential, so there is nothing a report could
  attach; the test asserts that column list explicitly and checks a message
  that merely looks like a snapshot is stored as plain text.
- **Page validation.** A page must be an internal `/app` path and may not carry
  a query string or fragment, so a report cannot point at an external address or
  smuggle a token. The message is bounded to 10–2000 characters.
- **Rate limiting.** One User may send five reports per rolling hour; the sixth
  is refused by name rather than silently dropped.
- **Safe failure messages.** Every failure the User sees is chosen by this
  module — a validation message or the rate-limit message — so a database or
  service detail never reaches the browser.
- **Authentication.** The shell and the `/app/feedback` route both require a
  session, and the action re-checks it, so an unauthenticated User can neither
  submit nor read reports. There is no list or detail route for feedback at all.

Verification: `pnpm test:unit` (`tests/unit/feedback.test.ts`: category
validation, message bounds, internal-page-only validation, and whitespace
sanitation of a stored message) and `pnpm test:db`
(`tests/database/feedback.test.ts`: the stored row exposes only the six
expected columns, a snapshot-shaped message is stored verbatim as text, the
hourly limit refuses the sixth report, and a short message stores nothing),
plus `pnpm test:browser` (`tests/browser/feedback.spec.ts`: submitting from the
dashboard records the current page, an unauthenticated visitor is redirected to
sign-in, and the send action stays disabled until the message is long enough).
