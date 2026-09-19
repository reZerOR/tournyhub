# TournyHub beta architecture

Status: Confirmed

This document defines the implementation shape of the first version. Product behavior belongs in [the product specification](product-spec.md), domain terms belong in [the glossary](../CONTEXT.md), and important tradeoffs are recorded in [ADRs](adr/README.md).

## System shape

TournyHub is a Next.js TypeScript application deployed to Vercel Hobby. Supabase provides PostgreSQL, Realtime, and Storage. Better Auth owns authentication records and sessions inside PostgreSQL. Gmail SMTP through Nodemailer sends email one-time codes and invitations during the private, non-commercial beta.

The browser never decides whether a Bid, close, assignment, reversal, or Rule change is valid. It submits a command, waits for a committed result, and then renders the authoritative Auction revision returned by the server.

```text
Browser
  | HTTPS commands and snapshot queries
  v
Next.js on Vercel
  | authenticated application commands
  v
Supabase PostgreSQL  --> committed outbox/state changes --> Supabase Realtime
  ^                                                        |
  |--------------------------------------------------------|
                     private live updates
```

## Application modules

The codebase should expose a small number of deep modules rather than scattering Auction rules through pages and API handlers.

| Module | Responsibility | Must not own |
| --- | --- | --- |
| Identity | Better Auth configuration, sessions, OTP and Google sign-in, invitations | Auction authorization or bidding rules |
| Auction Setup | Draft editing, imports, Teams, invitations, Rules, Readiness | Live mutations |
| Auction Command | Every fairness-affecting live mutation in one transaction boundary | UI rendering or email delivery |
| Auction Query | Authorized snapshots, lists, Results, and Audit History | Mutations |
| Realtime Distributor | Publish committed revisions and issue private channel access | Deciding command validity |
| Import and Export | CSV/XLSX validation and CSV/PDF Results generation | Editing authoritative records directly |
| Platform Administration | Suspension, session revocation, Auction hiding, recorded inspection | Editing Auction content or outcomes |

The Auction Command module is the primary system seam. A conceptual interface is:

```ts
executeAuctionCommand({
  auctionId,
  actorUserId,
  commandId,
  expectedRevision,
  command,
}): Promise<CommandResult>
```

The implementation may use typed functions instead of one literal function, but every command must share the same authentication, authorization, locking, revision, idempotency, audit, and event-publication rules.

## Authoritative Bid path

1. The Team Representative sends an idempotent command containing the Auction, Team, Active Player, expected Auction revision, and offered next price.
2. The server authenticates the session and confirms that it still controls that Team.
3. PostgreSQL locks the relevant Auction state and reads database time.
4. The transaction checks state, deadline, exact price, Team limits, remaining Budget, and Legal Completion reserve.
5. PostgreSQL commits the accepted or rejected attempt, advances the Auction revision when public state changes, and records any required Audit Entry or outbox event.
6. The request returns the authoritative result. Only then may the submitting browser display the Bid as accepted.
7. Realtime distributes the committed revision. Clients that miss a revision replace local Auction state with a fresh authorized snapshot.

Accepted commands with the same command ID return the original result. Stale commands never overwrite newer state. Rejected Bid details are returned only to the Organizer and submitting representative.

## Closing and timers

PostgreSQL timestamps and stored deadlines are authoritative. Browser timers are estimates for display only.

- Timed Close stores a deadline. A valid Bid in the final five seconds atomically replaces it with database time plus five seconds.
- Manual Close stores a three-second warning deadline. A valid Bid atomically cancels that warning and returns the Player to Open.
- A client seeing zero disables bidding and displays Finalizing. It does not declare a Sale.
- An idempotent finalization command closes an expired presentation under a database lock. Any eligible request may trigger finalization, and duplicate finalizers produce one result.
- Pausing stores the remaining duration and clears the active deadline. Resuming derives a new deadline from database time.

## Realtime model

Auction channels are private. The application server verifies Auction membership and issues short-lived access for the relevant channel. PostgreSQL remains the source of truth; Realtime is only a low-latency notification path.

Public live updates contain a monotonically increasing Auction revision and a compact state change. Accepted Bid fan-out may be coalesced to at most two updates per second, but command acknowledgements are never delayed behind fan-out. Private rejection details use an authorized response or private user channel.

On connect, reconnect, tab wake, revision gap, or authorization change, the client fetches a full snapshot. Losing Team authority immediately disables command controls.

## Client state

- TanStack Query owns server-derived data, snapshots, invalidation, and mutations.
- TanStack Table renders administrative Player, Team, invitation, history, and Results tables.
- Zustand is allowed only for short-lived client state that is awkward to colocate, such as wizard presentation or keyboard-control state. It must not mirror authoritative Auction data.
- URL state owns filters and shareable navigation where practical.
- shadcn components use the Base UI Nova preset and project design tokens.

## Provider boundaries

External services sit behind narrow interfaces so that free-tier substitutions do not infect Auction logic:

- `EmailSender` for OTP and invitation delivery
- `RealtimeDistributor` for committed revision notification
- `ObjectStore` for optional Team logos and generated exports
- `Clock` only for non-authoritative application behavior; database time controls bidding
- `AuditSink` as an application interface backed by immutable database rows, not an external tracker

No product analytics or external error-tracking SDK is included in the first version. Operational failures use structured platform logs with sensitive values redacted.

## Deployment environments and capacity

Development and production use separate Supabase projects and separate Vercel environment variables. Preview deployments must not mutate production data. The beta permits one Live Auction across the service, recommends no more than 16 Teams, supports no more than 32 Teams in the model, caps connected browser tabs at 40, and caps an Auction at 2,000 Player Entries.

Before real use, the production-like environment must demonstrate p95 Bid responses below 750 milliseconds with 40 connected tabs. The target is below 500 milliseconds, but the beta provides no SLA.

## Suggested source layout

The exact filenames may evolve, but ownership should remain recognizable:

```text
src/
  app/                    routes and server entry points
  components/             reusable visual components
  features/
    auctions/setup/       Draft workflow
    auctions/live/        live screens and command adapters
    auctions/results/     results and exports
    identity/             account UI and invitations
    administration/       platform moderation UI
  server/
    auth/                  Better Auth configuration and guards
    auction-command/       transactional domain commands
    auction-query/         authorized read models
    database/              schema access and migrations support
    email/                 EmailSender implementation
    realtime/              token broker and distribution
  domain/                  shared domain types without framework code
```

## Architectural acceptance criteria

The architecture is upheld when:

- No browser or Realtime message can independently create accepted Auction state.
- All live fairness mutations pass through the Auction Command module.
- Every public state change has one committed revision and can be rebuilt from a snapshot.
- Authorization is checked on every query, command, subscription grant, and export.
- Timer outcomes are independent of browser clocks and duplicate finalizers.
- Provider-specific code remains outside the domain command implementation.
