# Implementation plan

Status: Confirmed; implementation not started

The product owner confirmed the specification and supporting documents through the published `ready-for-agent` issue. Work proceeds in the vertical slices below. Each slice includes its own schema, server behavior, UI, tests, and documentation updates so unfinished domain logic does not accumulate behind mock screens.

## Working rules

For every slice:

1. Read the relevant sections of the product specification, glossary, architecture, database/commands, and security documents.
2. Record a new ADR only for a significant, durable decision not already covered.
3. Add or change migrations before application code that relies on them.
4. Implement server authorization and domain behavior before wiring interactive controls.
5. Add unit and integration tests, then the essential browser flow.
6. Run formatting, types, lint, and the affected tests from a clean state.
7. Update documentation when implemented behavior or operational knowledge changes.

Use the project's package runner and shadcn CLI to inspect and add components under the chosen Base UI Nova preset. Do not hand-copy registry output without checking the installed version. Keep TanStack Query as the owner of server state; use Zustand only for disposable presentation state.

## Slice 0: Foundation and quality gates

Create the Next.js TypeScript application, package scripts, shadcn Base UI Nova configuration, Tailwind tokens, formatting, linting, type checking, unit/integration/browser test harnesses, environment validation, and CI. Establish local Supabase/migration tooling and the domain/source layout from the architecture.

Complete when a clean checkout can install, validate safe environment configuration, start locally, apply an empty baseline schema, and pass all empty test suites in CI.

## Slice 1: Identity and private dashboard

Implement Better Auth with email OTP and Google, the database adapter, profile/account settings, session list and revocation, trusted origins, rate limits, and protected routing. Build the authenticated dashboard shell with Auctions organized, represented, invited to, and archived.

Complete when sign-up/sign-in, expiration, replay protection, cooldown, verified-email linking, seven-day sessions, fresh-auth checks, session revocation, and unrelated-route denial pass integration and browser tests. No password path exists.

## Slice 2: Auction basics and Player Entries

Implement Auction creation with title, Game, Rule/close mode, autosave state, Custom Player Fields, manual Player Entry editing, and CSV/XLSX import with mapping, worksheet choice, normalized preview, all-or-nothing commit, and downloadable errors.

Complete when an Organizer can create a private Draft, add or import up to 2,000 valid Players, resolve errors, and revisit saved state. External Player ID uniqueness, duplicate-name warnings, file limits, formula defenses, and cross-User access tests pass.

## Slice 3: Teams, representatives, and invitations

Implement Team CRUD, Calculate Teams using early total min/max values, Player Representative selection, Outside Representative invitations, acceptance/supersession, and representative replacement in allowed states.

Complete when every feasible Team count and recommendation are correct, generated Teams are editable, role uniqueness is enforced transactionally, exact-email invitation acceptance works for new and existing Users, and a replaced representative loses access from an open session.

## Slice 4: Rules, Tiers, feasibility, and Readiness

Implement Simple and Tiered Rules, Starting Prices, Bid Increment, shared Budget, total/Tier constraints, Tier ordering, the Legal Completion engine, grouped Readiness errors, and Ready/Draft derivation.

Complete when unit/property tests cover broad allocation cases, database tests show invariant enforcement, setup changes recompute Readiness, and only a feasible Auction with accepted representatives can start. Player Representatives count correctly and are excluded from bidding.

## Slice 5: Authoritative live Auction core

Implement the Auction Command module, snapshots, private Realtime grant/distribution, Organizer and representative consoles, next-Player selection/random selection, `Place Bid`, revisions, idempotency, Audit Entries, connection state, and snapshot recovery.

Complete when two concurrent equal-price Bids yield exactly one winner; Budget, maxima, stale state, deadline, and Legal Completion rejections are correct; accepted UI appears only after commit; rejected details stay private; and a missed revision causes snapshot replacement.

## Slice 6: Closing, tiers, and unsold resolution

Implement Manual Close, Timed Close, database deadlines, final-five-second reset, idempotent finalization, pause/resume, Tier progression, Unsold Rounds, Forced Assignment, constrained random matching, Final Unsold, and explicit completion.

Complete when concurrency tests prove Bid/finalizer ordering and exactly-once outcomes, browser refresh cannot change timer results, all Players are resolved before permitted Tier progress/completion, and every completed Auction satisfies its minimums.

## Slice 7: Corrections and controlled live changes

Implement highest-Bid cancellation, Sale Reversal/refund, allowed paused Rule/Budget/Player edits, ownership transfer, representative replacement, Auction cancellation, and participant announcements backed by immutable Audit Entries.

Complete when forbidden edits cannot commit, allowed edits preserve completed Sales and Legal Completion, history remains append-only, correction races serialize safely, and all connected participants receive the resulting authoritative revision.

## Slice 8: Results, lifecycle, copying, and feedback

Implement Results tables, role-filtered CSV phone numbers, PDF without phone numbers, copying choices, seven-day archive/restore/deletion, authenticated feedback, and the full phone-visibility lifecycle.

Complete when export contents and formula escaping pass tests, representatives see only authorized post-completion phone data, copies omit all User/Bid/Sale links, archive cleanup respects the recovery window, and feedback cannot attach sensitive application state.

## Slice 9: Platform administration and operations

Implement administrator bootstrap, User suspension, session revocation, Auction hiding, reason-gated inspection, moderation history, structured redacted logs, health checks, migrations, backup/restore scripts, and a human setup wizard.

Complete when administrators cannot edit outcomes, every inspection/moderation action is immutable and attributable, suspended Users lose sessions, recovery succeeds in a separate environment, and operational scripts do not print secrets.

## Slice 10: Hardening and beta launch

Polish responsive and accessible flows, keyboard controls, muted opt-in sound, reduced motion, loading/error/empty states, security headers, abuse limits, browser compatibility, capacity tests, and first-event documentation.

Complete only when every launch gate in [the test and launch plan](test-and-launch-plan.md) passes, including the 40-tab p95 Bid response requirement, concurrency suite, accessibility checks, secret audit, and backup restore rehearsal.

## Scope guardrails

Do not add tournament fixtures or standings, a public Auction directory, a Viewer role, real-money features, password sign-in, SMS, Player photos, product analytics, an external error tracker, PWA/offline behavior, push notifications, multiple simultaneous Live Auctions, or account deletion in these slices.

If a slice exposes a conflict in the confirmed requirements, stop that slice, document the concrete conflict and options, and ask the product owner. Do not resolve fairness, privacy, or money-like semantics through an undocumented assumption.
