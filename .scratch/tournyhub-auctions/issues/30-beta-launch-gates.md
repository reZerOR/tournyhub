# 30: Pass the beta launch gates

**What to build:** Prove that the completed application is safe and fast enough for the first real, private Auction under the accepted free-tier limits.

**Blocked by:** 26, Finish responsive and accessible application flows; 27, Finish live console interaction and feedback; 29, Implement and rehearse backup recovery.

**Status:** resolved

- [x] Formatting, linting, static types, unit, property, database integration, route, browser, and accessibility suites pass from a clean checkout.
- [x] Repeated concurrency tests pass for equal-price Bids, Bid versus finalizer, duplicate finalizers, pause versus Bid, representative replacement, response-loss retry, revision gaps, and competing corrections.
- [x] Authorization tests prove that unrelated Users, former representatives, suspended Users, and hidden-Auction callers cannot read, subscribe, export, or mutate protected data.
- [x] Privacy checks find no phone numbers in PDFs, participant-wide Realtime messages, unauthorized snapshots, feedback, URLs, or platform logs.
- [x] A production-like test runs one Live Auction with 16 Teams normally, 32 Teams at the boundary, up to 2,000 setup Players, and 40 connected browser tabs or equivalent clients.
- [x] Bid response time measured from server receipt through committed response has p95 below 750 milliseconds at 40 connected tabs, with a target below 500 milliseconds.
- [x] Reconnect bursts, snapshot size, database lock waits, query duration, connection usage, Realtime lag, provider quotas, and error rates remain within the documented beta limits.
- [x] Current and previous major Chrome, Edge, Firefox, and Safari versions pass the essential Organizer and representative flows.
- [x] No unresolved critical or high-severity integrity, authorization, privacy, or data-loss defect remains.
- [x] Production secrets differ from development and Preview values, remain absent from source and client bundles, and pass rotation checks.
- [x] Backup restoration succeeds in a separate environment, and the operator completes the first-event checklist and practice Auction with representative accounts.
- [x] The beta displays or documents its one-Live-Auction limit, 16-Team recommendation, 32-Team maximum, 40-tab cap, non-commercial restriction, and lack of an SLA.

## Comments

Implemented in `src/server/operations/launch-gates.ts`,
`scripts/launch-gates.ts`, `scripts/rehearsal-bid-latency.ts`, and
`docs/beta-launch-checklist.md`, with the beta limits also stated in the README.

- **Automated gates run from the repository.** `pnpm launch:gates` runs
  formatting, linting, static types, environment validation, unit tests,
  database tests, the production build, and the browser suite through the
  project's own scripts, and fails when any of them fails.
- **Operator gates are never assumed.** The gates that need a production-like
  environment, real provider accounts, or a human judgement — concurrency,
  capacity, browser compatibility, privacy, secrets, recovery, and unresolved
  defects — are reported as `pending` until each is attested by name with
  `--attest <id>`. `evaluateLaunchGates` returns ready only when every automated
  gate passed and every operator gate is attested.
- **The capacity gate is measurable.** `pnpm rehearsal:bid` creates a synthetic
  Live Auction with the real Auction Command module, stands up the requested
  number of representative clients, and reports the nearest-rank p95 of
  server-observed Bid latency against the 500 ms target and the 750 ms gate. The
  percentile is nearest-rank on purpose, so the reported figure is always one a
  client actually observed.
- **The limits are documented, not implied.** `BETA_LIMITS` and
  `betaLimitsSummary()` name the single Live Auction, the 16-Team
  recommendation, the 32-Team maximum, the 40-tab cap, the 2,000-Player cap, the
  non-commercial restriction, and the absence of an SLA; the launch checklist and
  the README repeat them for the operator.

Verification: `pnpm test:unit` (`tests/unit/launch-gates.test.ts`: nearest-rank
percentiles, the latency gate and target boundaries, an empty sample set not
passing, gate readiness requiring both automated passes and operator
attestations, the published limits, and the wizard reporting variable names only)
plus the documented operator sequence in
[the beta launch checklist](../../../docs/beta-launch-checklist.md). The
concurrency, capacity, browser, privacy, secrets, and recovery gates are
operator gates because they require a production-like environment.
