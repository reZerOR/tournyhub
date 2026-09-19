# 28: Prepare deployment and operational diagnostics

**What to build:** Make TournyHub deployable to separate development and production services with safe configuration, migrations, health checks, and redacted diagnostics.

**Blocked by:** 22, Publish Results and privacy-filtered exports; 23, Copy, archive, restore, and delete Auctions; 25, Moderate Users and Auctions.

**Status:** ready-for-agent

- [ ] Development and production use separate Supabase projects, Google OAuth clients, Better Auth secrets, Gmail credentials, and Vercel environment values.
- [ ] Preview deployments cannot receive production database, service-role, Gmail, Realtime signing, or administrator bootstrap credentials.
- [ ] Production migration commands report status, fail on drift, avoid running during ordinary requests, and document backward-compatible release order.
- [ ] The application exposes authenticated or non-sensitive health checks for application, database, authentication configuration, and Realtime dependencies.
- [ ] Production responses set the accepted Content Security Policy, framing, MIME sniffing, referrer, and permissions headers.
- [ ] Structured logs include request and command correlation, internal identifiers, status, latency, and stable error codes.
- [ ] Logs remove cookies, authorization headers, secrets, OTPs, invitation tokens, email bodies, phone numbers, custom Player values, raw imports, and full snapshots.
- [ ] The first Platform Administrator can be provisioned through a recorded bootstrap process, after which the temporary bootstrap route or value no longer works.
- [ ] A production-like deployment passes smoke tests for sign-in, private access, invitation delivery, snapshot recovery, and a synthetic Draft command without touching a real Live Auction.
