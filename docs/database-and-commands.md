# Database and command model

Status: Confirmed

This is the logical data contract for implementation. Migration files become the physical schema source of truth once code exists. Names may be adjusted during migration design, but the invariants in this document and [the product specification](product-spec.md) must remain true.

## Record groups

### Identity and platform

- Better Auth User, Account, Session, Verification, and related adapter records
- User Profile: display name, appearance, sound preference
- Platform Role: the small allowlisted set of Platform Administrators
- User Suspension: status, reason, actor, and timestamps
- Feedback: authenticated User, page, category, message, and timestamps

### Auction setup

- Auction: owner, title, Game, lifecycle state, Rule mode, close mode, revision, visibility/moderation state, archive deadline
- Auction Rule Set: Budget, Bid Increment, total minimum and maximum, default Starting Price, timer duration
- Tier: Auction-local ordered label, Starting Price, shared minimum and maximum
- Custom Player Field Definition
- Player Entry: required display name plus optional role, External Player ID, phone, Tier, Starting Price override, and custom values
- Team: unique Auction-local name, optional logo/color, representative type, Budget state
- Team Roster Entry: preassigned Player Representative, Sale, or Forced Assignment source
- Team Invitation: email target, single-use token digest, status, expiry, supersession, and acceptance

### Live and history

- Player Presentation: each time a Player becomes Active, including selection method, Starting Price, state, and deadlines
- Bid Attempt: command ID, Team, amount, server time, accepted/rejected status, and reason code
- Sale: Player, Team, amount, source, presentation, and reversal link where applicable
- Unsold Membership and Unsold Round
- Audit Entry: immutable actor, action, reason, server time, and safe before/after details
- Auction Outbox Event: committed revision and distributable payload/status
- Moderation Access Entry: administrator, reason, Auction, action, and server time

## Required uniqueness and checks

- Auction revision is a non-negative, monotonically increasing integer.
- Auction title and Game are non-empty after normalization.
- Team name is unique within an Auction using its normalized comparison form.
- External Player ID is unique within an Auction when present.
- Tier position is unique within an Auction.
- A Player Entry belongs to at most one active Roster.
- An Auction has at most one Active Player Presentation.
- A Team has exactly one accepted representative before Readiness.
- A User represents at most one Team per Auction.
- The Organizer represents no Team in the same Auction.
- Credits, Budget, prices, increments, and counts are whole numbers with valid positive or non-negative checks appropriate to the field.
- Minimums never exceed maximums.
- Accepted Bid amounts are unique per presentation and follow the exact fixed increment.
- Command IDs are unique within their command scope and return the first stored result on replay.
- Audit Entries and accepted history are append-only. Corrections create compensating records.

## Auction lifecycle

The allowed primary transitions are:

```text
Draft <-> Ready -> Live <-> Paused -> Completed
                              |          
                              +-------> Cancelled

Draft, Ready, Completed, or Cancelled -> Archived -> permanently deleted after 7 days
Archived -> its previous non-live state during the recovery window
```

Readiness is derived from current setup, not manually asserted. Editing a Ready Auction may return it to Draft. A Live Auction must be paused before correction, cancellation, ownership transfer, or permitted Rule changes.

## Command contract

Every state-changing request supplies a unique command ID. Live commands also supply the caller's expected Auction revision. The server returns one of:

- `accepted`: committed result and resulting revision
- `rejected`: stable reason code and safe current state
- `stale`: authoritative current revision and instruction to refetch
- `unauthorized`: no protected Auction details

All fairness-affecting commands execute in a PostgreSQL transaction that:

1. Authenticates and authorizes the actor.
2. Locks the Auction command row and other records required by the operation.
3. Uses database time.
4. Replays an existing result for a duplicate command ID.
5. Validates lifecycle, revision, Rules, capacity, and Legal Completion.
6. Writes the domain result, Bid attempt where relevant, Audit Entry where required, incremented revision, and outbox event.
7. Commits before returning success.

## Command families

### Setup commands

Create or update Auction basics; define Custom Player Fields; import, add, edit, or remove Player Entries; create or calculate Teams; configure representatives and invitations; define Tiers and Rules; check Readiness; start; copy; archive; restore; and transfer ownership.

Draft commands may use optimistic concurrency without the stricter live lock path, but authorization, idempotency for imports, and destructive-change checks still apply.

### Live commands

- Select or randomly select the next Player
- Return an unbid Player to the queue with a reason
- Place Bid
- Begin or cancel Manual Close
- Finalize an expired presentation
- Mark an unbid presentation Unsold
- Pause or resume
- Cancel highest Bid while paused
- Reverse Sale while paused
- Start or close an Unsold Round
- Request constrained random matching
- Activate the next Tier
- Apply permitted Rule, Budget, Player, or representative changes while paused
- Complete or cancel the Auction

### Administration commands

Suspend or restore a User, revoke sessions, hide or unhide an Auction, and begin a recorded moderation inspection. These commands cannot update the Auction's domain records.

## Bid validation

A `Place Bid` command is accepted only if all checks pass in the locked transaction:

- Auction is Live and not Paused.
- The presentation and expected revision are current.
- The deadline has not passed according to PostgreSQL.
- The actor is the current representative for the submitted Team.
- The Team is not already leading.
- The amount equals Starting Price for the first Bid or current price plus Bid Increment.
- The Team has not reached its total or Tier maximum.
- Available Credits cover the Bid.
- Winning still leaves a Legal Completion for the Team and Auction.

The first valid transaction acquiring the lock wins a simultaneous price. Losing or late attempts receive stable rejection reasons. An accepted final-five-second Timed Bid also moves the deadline to database time plus five seconds in the same transaction.

## Legal Completion

Legal Completion answers whether the Auction can still finish without violating any Team's remaining minimums, maximums, or Budget.

At minimum, validation must reserve for each Team:

- The number of Players still needed for the total Roster minimum
- In Tiered Rules, the number still needed in every Tier
- Available Roster and Tier capacity
- The cheapest attainable Starting Prices for the required remaining positions
- A globally possible allocation of remaining eligible Players across all deficient Teams

A local Budget check alone is insufficient. The implementation may use a matching or flow algorithm, but it must produce deterministic results from the same locked snapshot and handle preassigned Player Representatives, Sold Players, unopened Tiers, and the Unsold Pool.

Readiness uses the same feasibility engine as live commands. Constrained random matching first enumerates or derives complete feasible assignments, then uses cryptographically secure randomness to choose among them and stores the choice inputs/results for audit.

## Finalization and correction

Finalization is idempotent per Player Presentation. Under a lock it verifies the deadline or Manual Close warning, then creates exactly one Sale or Unsold outcome. The presentation records the final authoritative server time.

Cancelling the highest Bid never deletes it. It marks that accepted Bid cancelled, records the reason, restores the preceding valid Bid or Starting Price, and creates a new revision. Sale Reversal creates a compensating record, refunds the Team, removes the active Roster Entry, returns the Player to the Unsold Pool, and preserves the original Sale.

## Deletion and retention

Archiving records a deletion deadline seven days in the future. A scheduled or opportunistic cleanup may permanently delete only Auctions whose deadline has passed and whose lifecycle permits deletion. Restore clears the deadline inside the recovery window. Authentication records are not deleted in the first version because account deletion is out of scope.

Database backups and generated exports are operational copies, not alternate writable records. Their handling is defined in [the deployment and backup runbook](deployment-and-backup-runbook.md).
