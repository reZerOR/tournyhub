# Test and beta launch plan

Status: Confirmed

The beta may launch only when the product behavior in [the product specification](product-spec.md), the invariants in [the database and command model](database-and-commands.md), and the security controls in [the security document](security-and-permissions.md) are demonstrated in a production-like environment.

## Test layers

### Unit tests

Unit tests cover deterministic domain behavior without network services:

- Next valid Bid price and fixed-increment arithmetic
- Total and Tier minimum/maximum checks
- Budget reserve calculations
- Legal Completion and constrained random matching
- Readiness errors and links to affected setup sections
- Auction lifecycle transition table
- Timer deadline and anti-snipe calculations using supplied database times
- Phone-number visibility policy
- Import normalization, duplicate detection, and spreadsheet-formula escaping
- Permission decisions by role and lifecycle

Property-based cases should exercise feasibility and Budget arithmetic across many generated Team, Tier, and Player distributions. Credit calculations use integers only.

### Database integration tests

Integration tests run against a disposable PostgreSQL/Supabase-compatible database and verify:

- Schema constraints and unique indexes
- Transaction locks and monotonic revisions
- Idempotent command replay
- Simultaneous Bid ordering
- Deadline checks using database time
- Exactly-once presentation finalization
- Accepted Bid, cancellation, Sale, reversal, refund, and Audit Entry relationships
- Readiness and live commands using the same feasibility engine
- Invitation supersession and representative uniqueness
- Archive recovery and eligible permanent deletion
- Database access policies when direct client reads are enabled

### Application tests

Route and service tests cover session validation, role authorization, snapshots, commands, token grants, OTP requests, invitation acceptance, imports, exports, and redaction. Email and Realtime providers use contract fakes so failures and retries are deterministic.

### Browser end-to-end tests

End-to-end tests use at least one Organizer and multiple Team Representative sessions. They cover:

- OTP and Google sign-in happy paths and blocked/expired/replayed attempts
- The complete setup wizard, autosave status, imports, Team calculation, invitations, Rules, Readiness, and start
- Manual Close, Timed Close, final-five-second reset, pause/resume, and reconnect
- Competing simultaneous Bids from separate browser contexts
- Maximum, Budget, and Legal Completion rejection messages
- Unsold rounds, Forced Assignment, constrained random matching, and Final Unsold
- Highest-Bid cancellation, Sale Reversal, representative replacement, allowed paused edits, completion, and cancellation
- Results tables, role-filtered CSV/PDF contents, copying, archiving, and restoring
- Former representatives and unrelated Users losing/never receiving access
- Keyboard controls not firing while an input, text area, select, or editable element has focus

### Accessibility and compatibility

- Automated accessibility checks run on sign-in, dashboard, every setup step, Organizer console, representative console, Results, account, and administration screens.
- Keyboard-only completion is tested for all essential flows except file selection provided by the operating system.
- Focus is visible and logical after dialogs, toasts, errors, pause, and finalization.
- Color is never the only carrier of Team, state, acceptance, or rejection.
- Live regions announce material Bid and close changes without announcing every timer tick.
- Reduced motion and muted-by-default sound are verified.
- Layout is tested at representative phone, tablet, laptop, and wide desktop sizes.
- Support covers the current and previous major versions of Chrome, Edge, Firefox, and Safari at launch time.

## Critical concurrency scenarios

The following are release-blocking tests:

1. Two Teams submit the same next price concurrently. Exactly one is accepted.
2. A Bid and timer finalizer contend at the deadline. Database ordering yields one valid result with no post-deadline acceptance.
3. Two finalizers run for one presentation. Exactly one Sale or Unsold result exists.
4. The Organizer pauses while a Bid is in flight. The committed lock order determines one consistent outcome.
5. A representative is replaced while their tab is open. Subsequent commands and subscription renewal are denied.
6. The same accepted command is retried after a network timeout. No duplicate Bid, Sale, refund, or audit record appears.
7. A client skips a revision. It discards its projection and receives the current snapshot.
8. A Sale Reversal contends with another correction. Only a legal serialized state commits.

## Performance and capacity rehearsal

Use a production-like Vercel deployment and the production-region Supabase project shape, with synthetic data and no real Player phone numbers.

The rehearsal uses:

- One Live Auction
- 16 Teams for the normal scenario and 32 for a boundary scenario
- Up to 2,000 Player Entries in setup/import tests
- 40 connected browser tabs or equivalent clients
- Sustained valid and rejected Bid contention around close boundaries
- Reconnect and snapshot bursts
- Public Realtime fan-out capped at two updates per second

Measure server-observed Bid response latency from receipt through committed response. The target is below 500 milliseconds and the launch gate is p95 below 750 milliseconds. Also record error rate, database lock wait, query duration, connection usage, Realtime delivery lag, and snapshot size. A boundary scenario may establish an operating restriction even if the recommended 16-Team scenario passes, but the 40-tab p95 gate cannot be waived silently.

## Recovery rehearsal

Before real use:

- Create an application backup using the runbook.
- Restore it into a separate non-production project.
- Verify row counts and checksums for critical tables.
- Sign in with test identities and open a restored Auction snapshot and Results.
- Verify uploaded Team logos or other stored objects from the separate storage copy.
- Record elapsed time, missing data, and corrective actions.

## Launch gates

All items are required:

- Product owner confirms the proposed documentation.
- Every implementation slice in [the implementation plan](implementation-plan.md) meets its completion criteria.
- Static types, linting, unit, integration, and end-to-end suites pass from a clean checkout.
- All critical concurrency scenarios pass repeatedly.
- The production-like 40-tab Bid test has p95 below 750 milliseconds.
- No unresolved critical or high-severity authorization, privacy, integrity, or data-loss defect remains.
- Accessibility checks have no critical violations and all essential keyboard flows pass.
- Gmail delivery, Google OAuth, invitation links, allowed origins, and production redirects are verified.
- Production secrets differ from development and preview and are absent from source control and client bundles.
- Backup and separate-environment restore rehearsal succeeds.
- The first Platform Administrator and emergency ownership-transfer path are verified.
- The beta limits and lack of SLA are visible to the operator.

## No-go conditions

Do not run a real Auction when any of these is true:

- Bids can be accepted without a committed authoritative response.
- A timer depends on a browser clock for its outcome.
- Legal Completion checks are disabled, inconsistent, or too slow for the measured load.
- An unrelated User, former representative, or hidden/suspended User retains access.
- Phone numbers appear in PDF, public Realtime payloads, logs, or unauthorized snapshots.
- Bid, Sale, correction, or Audit history can be overwritten or deleted through normal application paths.
- Production restore has not been rehearsed.
- Service quotas are already near a provider limit needed by the Auction.

## First-event checklist

Immediately before the first real Auction, the operator confirms the system health check, current provider status, quota headroom, recent backup, roster and Tier feasibility, accepted representatives, and an alternate contact channel. Run one short practice Auction with the actual representatives before the scheduled event.
