# Build the TournyHub Auctions beta

Status: ready-for-agent

## Problem Statement

People who organize player auctions for games and sports need a fair way to assemble Teams without using real money. General meeting and spreadsheet tools do not order simultaneous Bids, enforce shared Budget and Roster Rules, prevent a Team from spending Credits it still needs to complete its Roster, or maintain a trusted history of Organizer corrections.

The Organizer needs to import Players, define Teams and representatives, configure Simple or Tiered Rules, run one Player auction at a time, resolve unsold Players, and publish final Rosters. Team Representatives need fast live bidding with clear authoritative feedback. Players do not need accounts or need to attend. The first version must run as a small, private, non-commercial beta on free services without weakening Auction integrity.

## Solution

Build a responsive Next.js application for live player Auctions. Any registered User can create an Auction. The Organizer adds Player Entries, creates Teams, assigns a Player Representative or invites an Outside Representative, defines Rules, and starts only after the system proves that at least one Legal Completion exists.

During a Live Auction, one Active Player is offered at a time. Team Representatives submit the exact next Bid for their Teams. PostgreSQL orders and validates each command before the application acknowledges or broadcasts it. Manual Close and Timed Close use database deadlines. The system blocks a Bid that violates Budget, maximums, timing, authority, or Legal Completion.

Tiered Auctions finish each Tier before the Organizer activates another Tier or runs an Unsold Round. The application supports Forced Assignment and constrained random matching when needed to satisfy minimums. Organizer corrections remain visible through immutable Bid, Sale, reversal, and Audit history.

The beta uses Better Auth email OTP and Google sign-in, Vercel Hobby, Supabase Free PostgreSQL, Realtime, and Storage, and Gmail through Nodemailer. Auction access remains private to the Organizer, assigned Team Representatives, and reason-gated Platform Administrator inspection.

## User Stories

1. As a new User, I want to register with an email one-time code, so that I can use TournyHub without creating a password.
2. As a new User, I want to register with Google, so that I can sign in with an existing verified identity.
3. As an invited person, I want to register before accepting an Auction Invitation, so that I can represent a Team even if I had no prior account.
4. As a User, I want Google to link safely to an account with the same verified email, so that I do not create duplicate identities.
5. As a User, I want to see and revoke my active sessions, so that I can remove access from a lost or shared device.
6. As a User, I want a seven-day session, so that I do not need to authenticate repeatedly during normal beta use.
7. As a User, I want to set my display name, appearance, and sound preference, so that the application fits how I use it.
8. As a User, I want a dashboard of Auctions I organize, Teams I represent, pending invitations, and archived Auctions, so that I can find my work.
9. As a registered User, I want to create an Auction, so that I can organize a player auction without platform staff.
10. As an Organizer, I want to enter an Auction title and Game name, so that participants understand the event's purpose.
11. As an Organizer, I want to choose Simple Rules or Tiered Rules, so that the setup fits the Player pool.
12. As an Organizer, I want to choose Manual Close or Timed Close, so that I can control how each Player auction ends.
13. As an Organizer, I want setup changes to autosave with visible status, so that I know whether my work is stored.
14. As an Organizer, I want to move among setup sections without losing work, so that I can gather information in a practical order.
15. As an Organizer, I want to add a Player Entry with only a display name, so that incomplete optional data does not block initial entry.
16. As an Organizer, I want to store an optional role, External Player ID, phone number, Tier, Starting Price override, and custom values, so that the Auction contains the useful game-specific details.
17. As an Organizer, I want External Player IDs to be unique within the Auction, so that game UIDs identify the correct Player.
18. As an Organizer, I want duplicate display names to produce a warning instead of a hard error, so that different Players may share a name.
19. As an Organizer, I want to define Custom Player Fields for one Auction, so that I can capture details that TournyHub does not prescribe.
20. As an Organizer, I want to import up to 2,000 Player Entries from CSV or XLSX, so that I do not need to re-enter an existing list.
21. As an Organizer, I want to select an XLSX worksheet and map arbitrary columns, so that common spreadsheet layouts work without manual restructuring.
22. As an Organizer, I want to preview normalized import data and download its errors, so that I can fix the source file confidently.
23. As an Organizer, I want an import to commit all valid rows together or none of them, so that a failed import cannot leave a partial Player pool.
24. As an Organizer, I want to create Teams with unique names, optional colors, and optional logos, so that participants can identify them.
25. As an Organizer, I want to enter minimum and maximum Roster sizes before calculating Teams, so that the calculator uses the intended constraints.
26. As an Organizer, I want Calculate Teams to show every feasible Team count and a recommendation, so that I retain the final choice.
27. As an Organizer, I want calculated Teams to start unnamed and unassigned, so that I can finish their identities after choosing the count.
28. As an Organizer, I want to choose a Player Representative from the Player Entries, so that a playing representative starts on that Team's Roster and does not enter bidding.
29. As an Organizer, I want to invite an Outside Representative by email, so that a non-playing User can operate a Team.
30. As an invited User, I want an invitation to work only for my exact verified email, so that another User cannot claim my Team.
31. As an Organizer, I want a replacement invitation to invalidate earlier invitations immediately, so that only the current intended representative can accept.
32. As an Organizer, I want to replace a representative during Draft, Ready, or Paused state, so that the Auction can continue when personnel change.
33. As a former Team Representative, I want my old controls to stop immediately after replacement, so that I cannot act for the Team by mistake.
34. As an Organizer, I want each Team to start with the same whole-number Credit Budget, so that every Team begins under equal financial rules.
35. As an Organizer, I want one positive whole-number Bid Increment, so that the next valid Bid is predictable.
36. As an Organizer using Simple Rules, I want total Roster minimum and maximum values with a default Starting Price, so that I can run an Auction without Tiers.
37. As an Organizer using Tiered Rules, I want ordered custom Tiers with their own Starting Prices, so that Players of different levels enter bidding separately.
38. As an Organizer using Tiered Rules, I want shared minimum and maximum counts for every Team in each Tier, so that Team composition remains balanced.
39. As an Organizer, I want to override a Player's default Starting Price before bidding begins, so that an exceptional Player can have a different opening price.
40. As an Organizer, I want clear grouped Readiness errors with links to the affected setup records, so that I can repair the Auction efficiently.
41. As an Organizer, I want Readiness to verify Teams, representatives, Player data, Rules, Tiers, Budget, constraints, and Legal Completion, so that the Auction cannot start in an impossible state.
42. As an Organizer, I want a disconnected-representative warning instead of mandatory representative approval, so that I retain authority to start.
43. As a Team Representative, I want to see the Active Player, current price, leading Team, exact next price, Budget, capacities, and connection status, so that I can make a valid Bid.
44. As a Team Representative, I want one Bid action without a confirmation dialog, so that I can respond quickly in a live Auction.
45. As a Team Representative, I want the Bid control to become pending until the server responds, so that an uncommitted Bid never looks accepted.
46. As a Team Representative, I want the server to accept the first valid simultaneous Bid, so that network races have one deterministic winner.
47. As a Team Representative, I want the application to reject a Bid when my Team already leads, so that I cannot bid against myself.
48. As a Team Representative, I want the application to reject a Bid after my Team reaches a total or Tier maximum, so that I cannot build an illegal Roster.
49. As a Team Representative, I want the application to reject a Bid my Team cannot afford, so that its remaining Credits never become negative.
50. As a Team Representative, I want the application to reserve enough Credits and Players for my Team's cheapest Legal Completion, so that a winning Bid cannot make required minimums impossible.
51. As a Team Representative, I want rejected Bid details to remain private to me and the Organizer, so that other Teams do not learn my failed action.
52. As an Auction participant, I want accepted Bids for the Active Player to appear after database commit, so that every participant sees trusted state.
53. As an Organizer, I want to choose the next Player from the Active Tier, so that I can follow a planned order.
54. As an Organizer, I want Random Selection within the Active Tier, so that the system can choose without Organizer preference.
55. As an Auction participant, I want a random choice to become visible immediately, so that the Organizer cannot redraw secretly.
56. As an Organizer, I want to return an unbid Active Player to the queue with a recorded reason, so that I can correct an accidental selection.
57. As an Organizer using Manual Close, I want to start a three-second closing warning, so that representatives receive a final bidding window.
58. As a Team Representative, I want a valid Bid during Manual Close to reopen bidding, so that the latest leader is not sold immediately.
59. As an Organizer, I want to cancel a Manual Close warning without changing the leader, so that I can stop an accidental close.
60. As an Organizer using Timed Close, I want one configurable duration with a 30-second default, so that every Player follows the same timer.
61. As a Team Representative, I want a valid Bid in the final five seconds to reset the timer to five seconds, so that last-second Bids allow a response.
62. As an Auction participant, I want browser timers to display database-authoritative deadlines, so that clock differences cannot decide a Sale.
63. As an Auction participant, I want bidding to disable and show Finalizing at zero, so that a browser does not announce an outcome before the server commits it.
64. As an Organizer, I want to pause and resume the Auction, so that I can handle interruptions without losing the Active Player, leader, or remaining time.
65. As a Team Representative, I want new Bids rejected while Paused, so that nobody gains an advantage during an interruption.
66. As a Team Representative, I want bidding disabled when my connection is stale, so that I do not submit against unknown state.
67. As an Auction participant, I want reconnection to fetch an authoritative snapshot, so that missed live messages cannot leave my screen inconsistent.
68. As an Organizer, I want a Player with no valid Bid to enter the Unsold Pool automatically, so that the next step is clear.
69. As an Organizer, I want every available Player in the Active Tier offered once before Tier progression, so that higher Tiers cannot be skipped selectively.
70. As an Organizer, I want to activate the next Tier or run an Unsold Round after a Tier finishes, so that I control when unresolved Players return.
71. As an Organizer, I want no fixed retry limit for an unsold Player, so that I can keep trying while a legal allocation remains possible.
72. As a Team Representative, I want a reoffered Player to keep the same Starting Price, so that the Organizer cannot manipulate the price between offerings.
73. As a deficient Team Representative, I want the only remaining eligible Player assigned to my Team at Starting Price when the assignment is forced, so that required Tier minimums can be completed.
74. As an Organizer, I want constrained random matching when several deficient Teams and Players remain, so that complete feasible assignments are selected without manual favoritism.
75. As an Organizer, I want to close the Unsold Pool and mark remaining Players Final Unsold after all Team minimums are met, so that the Auction can finish.
76. As an Organizer, I want to cancel the current highest Bid while Paused, so that I can correct an accepted mistake without deleting history.
77. As an Auction participant, I want highest-Bid cancellation to restore the previous valid Bid or Starting Price, so that bidding resumes from the correct state.
78. As an Organizer, I want to reverse a Sale while Paused, refund its Team, and return the Player to the Unsold Pool, so that I can correct a completed outcome.
79. As an Auction participant, I want all corrections to create immutable Audit Entries and announcements, so that fairness-affecting changes remain visible.
80. As an Organizer, I want to add Players only to unopened Tiers after the Auction starts, so that current and completed Tier outcomes remain stable.
81. As an Organizer, I want to increase every Team's Budget equally while Paused, so that I can address a planning mistake without favoring one Team.
82. As an Organizer, I want permitted Rule changes to preserve completed Sales and Legal Completion, so that a change cannot invalidate history or make completion impossible.
83. As an Organizer, I want to transfer ownership to an eligible User while Draft, Ready, or Paused, so that another person can continue the Auction.
84. As an Organizer, I want to complete an Auction only after all Tiers and minimums are resolved and no Player is active, so that Results are valid.
85. As an Organizer, I want to cancel a Live Auction only while Paused, so that cancellation is deliberate and visible.
86. As an Auction participant, I want Completed and Cancelled Auctions to remain read-only, so that final history cannot drift.
87. As an Organizer, I want to copy an earlier Auction into a new Draft, so that I can reuse Rules, fields, and selected Player Entries.
88. As an Organizer, I want to choose whether copied Players keep Tier and price data, so that I can reuse identities with new Auction values.
89. As a User, I want copied Auctions to omit representatives, invitations, Bids, Sales, and Results, so that a new Auction has no stale authority or history.
90. As an Organizer, I want to archive an Auction and restore it within seven days, so that accidental archival is recoverable.
91. As an Organizer, I want an Archived Auction deleted after seven days without a reminder, so that the first version has a simple retention rule.
92. As an Organizer, I want Results grouped by Team with Rosters, Credits, Tier counts, prices, Forced Assignments, and Final Unsold Players, so that I can publish the outcome.
93. As an Organizer, I want a Results CSV containing every supplied Player phone number, so that I can coordinate with all selected Players.
94. As a Team Representative, I want my Results CSV to include phone numbers only for Players on my Team's Roster, so that I receive the contacts I need without receiving other Teams' contacts.
95. As an Auction participant, I want Results PDFs to omit all phone numbers, so that shareable documents do not expose private contact data.
96. As a Team Representative, I want to view supplied phone numbers for all Players while the Auction is Live or Paused, so that I can inspect the current Player pool when needed.
97. As a Team Representative, I want completed contact access limited to my Roster, so that other Teams' contact details become private after bidding.
98. As a User, I want light and dark appearance with responsive phone and desktop layouts, so that I can use the application in different venues and devices.
99. As a User, I want live numbers to use tabular digits, so that changing prices and timers do not shift visually.
100. As a Team Representative, I want live sounds to start muted and require opt-in, so that opening the Auction does not make unexpected noise.
101. As a User who prefers reduced motion, I want transitions reduced or disabled, so that live updates remain comfortable.
102. As an Organizer, I want keyboard controls for pause, resume, closing, unsold handling, and Player selection, so that I can operate the Auction quickly.
103. As an Organizer, I want shortcuts disabled while I type, so that text entry cannot trigger a live action.
104. As a User, I want an authenticated feedback form that records the page and category without private Auction data, so that I can report a beta problem safely.
105. As a Platform Administrator, I want to suspend an abusive User and revoke sessions, so that I can protect the beta.
106. As a Platform Administrator, I want to hide an Auction, so that prohibited content is unavailable while the record remains intact.
107. As a Platform Administrator, I want to enter a reason before inspecting protected Auction data, so that moderation access is attributable.
108. As an Auction participant, I want Platform Administrators unable to edit Auction Rules, Bids, Teams, Sales, or Results, so that moderation power cannot change outcomes.
109. As an unrelated registered User, I want other Auctions to remain undiscoverable and inaccessible, so that open registration does not create public viewing.
110. As the beta operator, I want the service to allow only one Live Auction, so that the free infrastructure stays within its tested limits.
111. As the beta operator, I want a 16-Team recommendation, a 32-Team model limit, a 40-tab cap, and a 2,000-Player cap, so that each Auction stays within measured capacity.
112. As the beta operator, I want Bid response p95 below 750 milliseconds with 40 connected tabs before launch, so that the live experience meets the accepted gate.
113. As the beta operator, I want tested backups and a separate-environment restore process, so that an infrastructure problem does not leave Auction history unrecoverable.

## Implementation Decisions

- Build one Next.js TypeScript application with the App Router. Deploy it to Vercel Hobby for a personal, non-commercial beta.
- Use Supabase Free for PostgreSQL, Realtime, and optional Team-logo storage. Keep PostgreSQL as the only authoritative source for Auction state and history.
- Use Better Auth with its PostgreSQL adapter. Enable email OTP and Google sign-in only. Disable passwords.
- Send beta OTP and invitation email through Nodemailer and a dedicated Gmail account. Use Google OAuth 2.0 for SMTP where practical, with a beta-only app credential fallback.
- Use shadcn components with the Base UI Nova preset, TanStack Query for server state, TanStack Table for data tables, and Zustand only for disposable presentation state that cannot remain local.
- Build Identity, Auction Setup, Auction Command, Auction Query, Realtime Distributor, Import and Export, and Platform Administration as distinct modules.
- Route every fairness-affecting live mutation through the Auction Command module. This is the primary domain and testing seam.
- Give each state-changing request a unique command ID. Live commands also include the expected Auction revision.
- Return accepted, rejected, stale, or unauthorized command outcomes. A duplicate command ID returns the original stored result.
- Authenticate the User and derive authority on the server. Never trust actor, Organizer, or Team ownership supplied by the browser.
- Lock the Auction command state and required dependent rows during live commands. Use PostgreSQL time for Bid deadlines and finalization.
- Commit the command result, Bid attempt, immutable Audit Entry when required, updated revision, and outbox event in one transaction before acknowledging success.
- Use a monotonically increasing Auction revision for all shared live state. A client that misses a revision fetches and replaces its state with an authorized snapshot.
- Use private Realtime channels. The application server verifies Auction membership before granting short-lived channel access.
- Treat Realtime as committed-state distribution only. Realtime cannot accept a Bid, select a winner, finalize a Player, or authorize a User.
- Cap participant-wide state fan-out at two updates per second. Command acknowledgements remain immediate and are not held behind fan-out batching.
- Keep rejected Bid details in the command response or a User-specific channel. Shared Auction messages contain only state available to every participant.
- Model Auction lifecycle states as Draft, Ready, Live, Paused, Completed, Cancelled, and Archived. Derive Ready from current setup instead of storing an unchecked manual flag.
- Allow Draft and Ready setup edits. Require Paused for live corrections, cancellation, ownership transfer, representative replacement, Budget changes, and permitted Rule changes.
- Store Player Entries within one Auction. Do not create global Player profiles.
- Store optional External Player IDs as Auction-local unique values. Treat them as Organizer-defined game or organization identifiers, not government identity.
- Model Player Representatives as both the Team Representative and a preassigned Roster member. Count them toward total and Tier limits and omit them from bidding.
- Give each Team one representative and each User at most one represented Team in an Auction. Prevent the Organizer from representing a Team in the same Auction.
- Store targeted invitation token digests. Require the exact verified invited email. A new invitation for a Team supersedes older pending invitations.
- Use whole integers for Credits, Budget, Bid prices, increments, and Roster counts.
- Share one starting Budget, one Bid Increment, and the same total and Tier constraints across every Team.
- In Simple Rules, use total Roster limits and one default Starting Price with optional Player overrides.
- In Tiered Rules, require one ordered Tier for each Player and store a Starting Price plus shared minimum and maximum per Tier.
- Make the first valid Bid equal the Player's Starting Price. Make each later Bid exactly the current price plus the fixed Bid Increment.
- Evaluate Legal Completion during Readiness and every Bid or correction that can affect feasibility. Include remaining Player supply, Team deficits, capacity, Starting Prices, Budget reserves, preassigned representatives, completed Sales, unopened Tiers, and the Unsold Pool.
- Reject a Bid if winning would make a legal final allocation impossible, even when the Team can afford the immediate amount.
- Use database deadlines for Manual Close and Timed Close. A valid Bid during the final five seconds of Timed Close moves the deadline to database time plus five seconds in the same transaction.
- Finalize a Player Presentation with an idempotent database command. Duplicate or competing finalizers produce one Sale or Unsold result.
- Pause by storing remaining duration and clearing the active deadline. Resume by creating a new deadline from PostgreSQL time.
- Store each Player Presentation, including selection method, opening price, state, and deadlines. Preserve every accepted and rejected Bid attempt with its server time and stable reason.
- Preserve accepted Bids, Sales, and corrections as append-only history. Cancel or reverse through compensating records instead of deleting prior facts.
- Let constrained random matching choose only complete assignments that preserve Legal Completion. Store the chosen result and enough input detail for audit.
- Store Audit Entries for random redraws, Bid cancellations, Sale Reversals, representative replacement, ownership transfer, Rule or Budget changes, Auction cancellation, administrator inspection, and moderation.
- Use CSV Parse for CSV and a pinned SheetJS Community Edition release for XLSX. Enforce file, worksheet, row, column, custom-field, and cell-length limits.
- Commit imports all at once after normalized preview and validation. Treat formulas and links as data.
- Generate CSV and PDF from the same authorized Results read model. Escape spreadsheet formula prefixes in CSV.
- Include all supplied phone numbers in the Organizer CSV. Include only Roster Player phone numbers in a Team Representative CSV. Exclude phone numbers from every PDF.
- Keep phone numbers out of default tables, the Active Player card, participant-wide Realtime payloads, logs, feedback, URLs, and unauthorized snapshots.
- Use open registration with private Auction authorization. Do not add a Viewer role or public Auction discovery.
- Configure email OTP with a ten-minute expiry, at most five attempts, secure digest storage, a 60-second resend delay, and rate limits by normalized email, IP, and account where applicable.
- Allow automatic Google linking only for the same verified email. Require recent authentication for sensitive account and administration actions.
- Use secure HTTP-only production cookies, trusted origins, CSRF protection, restrictive browser security headers, server-side input validation, and parameterized database access.
- Keep Supabase service credentials and Gmail credentials on the server. Separate development, preview, and production secrets and data.
- Permit Platform Administrators to suspend Users, revoke sessions, hide Auctions, and perform reason-gated inspection. Do not grant them domain mutation or impersonation powers.
- Use structured Vercel and Supabase logs with secrets, cookies, OTPs, invitation tokens, phone numbers, Player custom fields, and raw imports removed.
- Separate development and production Supabase projects. Prevent Preview deployments from using production service credentials.
- Take encrypted logical database backups outside the production Supabase project before and after every real Auction, before risky migrations, and at least monthly while retained Auctions exist.
- Copy Supabase Storage objects separately from database backups. Rehearse restoration in a separate non-production project before beta use.
- Implement the product in vertical slices: foundation, identity, Players, Teams and representatives, Rules and feasibility, live bidding, closing and unsold handling, corrections, Results and lifecycle, administration and operations, then launch hardening.

## Testing Decisions

- Test external behavior and durable outcomes. Avoid assertions against private helper calls, ORM query shape, component internals, or Realtime implementation details.
- Use the Auction Command module as the primary test seam. Submit commands as authenticated actors and assert the committed result, Auction revision, authorized snapshot, immutable history, and emitted distribution record.
- Add focused unit and property tests for deterministic arithmetic, Roster constraints, Legal Completion, constrained matching, lifecycle transitions, permissions, import normalization, export filtering, and deadline calculations.
- Run database integration tests against a disposable PostgreSQL or Supabase-compatible database. Verify constraints, locks, idempotency, server time, revisions, command ordering, audit relationships, archive deletion, and any Row Level Security policies.
- Test identity and application routes at their public HTTP boundary. Cover OTP expiry, replay, resend limits, verified-email linking, session revocation, invitations, snapshot authorization, private Realtime grants, imports, exports, and redaction.
- Use browser tests for complete User workflows. Cover sign-in, Auction setup, imports, Team calculation, invitations, Rules, Readiness, live bidding, closing, pause and resume, reconnection, unsold handling, corrections, Results, copying, archiving, and administration.
- Treat eight concurrency scenarios as release blockers: simultaneous equal-price Bids, Bid versus deadline finalizer, duplicate finalizers, pause versus Bid, representative replacement with an open tab, command retry after response loss, revision gaps, and competing corrections.
- Assert that simultaneous Bids create exactly one accepted winner and stable rejections for the other attempts.
- Assert that timer outcomes use database ordering and never depend on a browser clock or Realtime arrival order.
- Assert that duplicate command and finalization requests cannot create duplicate Bids, Sales, refunds, revisions, or Audit Entries.
- Assert that unrelated Users, former representatives, suspended Users, and hidden-Auction callers cannot query, subscribe, export, or mutate protected Auction data.
- Assert phone-number visibility by role and lifecycle. Check snapshots, shared Realtime messages, tables, details, CSV, PDF, feedback, and logs.
- Run automated accessibility checks on sign-in, dashboard, all setup steps, both live consoles, Results, account settings, and administration.
- Test keyboard-only use, focus changes, live-region announcements, color-independent state, muted sound, reduced motion, and representative phone, tablet, laptop, and wide desktop layouts.
- Support the current and previous major versions of Chrome, Edge, Firefox, and Safari at the time of beta launch.
- Run a production-like rehearsal with one Live Auction, 16 Teams normally, 32 Teams as a boundary, 2,000 setup Players, 40 connected tabs, Bid contention, reconnect bursts, and two shared fan-outs per second.
- Measure Bid response time from server receipt through committed response. Target below 500 milliseconds and block launch unless p95 is below 750 milliseconds with 40 connected tabs.
- Rehearse backup and restore into a separate environment. Verify schema version, critical row counts, relationships, representative access, Results, Audit History, and copied Storage objects.
- The repository contains no application code or existing test suite yet. The confirmed product specification, command model, security policy, and launch plan are the prior art for test cases. Establish reusable test factories and browser actors in the foundation slice.
- Launch only when types, lint, unit, integration, browser, concurrency, accessibility, performance, secret, and recovery gates pass with no unresolved critical or high-severity integrity, authorization, privacy, or data-loss defect.

## Out of Scope

- Tournament fixtures, brackets, scores, standings, or tournament management after the Auction
- Real-money bidding, payments, wallets, or cash-value Credits
- A public Auction directory, public discovery, public Results, or a Viewer role
- Player accounts as a requirement for inclusion in an Auction
- Multiple Team Representatives for one Team or one User representing several Teams in the same Auction
- Co-Organizers or simultaneous Organizer control
- Predefined Game lists or game-specific rule engines
- Player photos
- Password sign-in, SMS OTP, phone-based authentication, or two-factor authentication
- Account deletion in the first version
- Product analytics or an external error-tracking service
- Native mobile applications, progressive web application installation, offline bidding, push notifications, or background mobile delivery
- Multiple simultaneous Live Auctions in the beta
- Commercial events, paid hosting guarantees, an availability SLA, or a guaranteed sub-500-millisecond response SLA
- More than 32 Teams, more than 2,000 Player Entries, or more than 40 connected browser tabs in the accepted beta model
- Lowering Starting Prices for unsold Players after bidding starts
- Manual Organizer selection of individual Forced Assignment pairings when several complete assignments exist
- Editing or deleting accepted history instead of using cancellation and reversal records
- Automatic migration to Cloudflare Durable Objects or other paid production infrastructure during the beta build

## Further Notes

- This issue consolidates the completed design discussion. There are no remaining product questions for the first-version specification.
- The primary test seam is the authenticated Auction Command module. Browser tests cover the complete experience above it, and database tests cover concurrency and persistence below it. This matches the confirmed architecture and keeps live-rule validation in one place.
- The product specification is the source of truth for user-visible behavior. The domain glossary is the source of truth for Auction vocabulary. ADRs record the accepted architecture, authentication, history, Realtime, UI, and administration decisions.
- The free stack is approved only for a small personal, non-commercial beta. Recheck current provider terms and limits before deployment or any commercial use.
- The implementation agent should follow the ordered vertical slices and their completion gates. It should stop and request a product decision only if implementation exposes a real conflict among confirmed requirements.
- Tournament management is the planned future direction, but this issue covers Auctions only.

## Comments

