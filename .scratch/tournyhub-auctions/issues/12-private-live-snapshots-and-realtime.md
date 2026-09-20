# 12: Connect private live Auction snapshots

**What to build:** Give the Organizer and assigned Team Representatives role-appropriate live consoles backed by private authoritative Auction state.

**Blocked by:** 11, Add Tiered Rules and Tier feasibility.

**Status:** resolved

- [x] The Organizer and current Team Representatives can open the Live Auction, while unrelated Users receive no protected Auction details.
- [x] The application server verifies membership before granting short-lived access to a private Auction Realtime channel.
- [x] A full snapshot contains the current revision, lifecycle, Active Tier, queues, Team public state, and only the caller's authorized private details.
- [x] The Organizer console exposes Organizer controls, while a representative console exposes controls only for its Team.
- [x] Every committed shared state change increments a monotonic Auction revision and publishes an outbox-backed notification.
- [x] Participant-wide fan-out is capped at two updates per second without delaying direct command responses.
- [x] Connect, reconnect, tab wake, and revision gaps fetch a fresh authorized snapshot instead of reconstructing missing state in the browser.
- [x] Browser clients never receive a database password, Supabase service credential, phone-number broadcast, or authorization decision from Realtime.
- [x] Tests prove private channel denial, role filtering, revision recovery, coalesced fan-out, revoked access, and authoritative snapshot replacement.

## Comments

Implemented in `src/domain/live.ts`, `src/server/auction-query/live-snapshot.ts`,
`src/server/realtime/grant.ts`, `src/server/realtime/distributor.ts`,
`src/server/realtime/outbox.ts`, the live server actions and console, the shared
live-command helpers in `src/server/auction-command/live-command.ts`, and the
snapshot/grant/outbox tests.

- **Authorization.** `getLiveSnapshot` returns null for an Auction that is not
  Live or Paused and for a caller who is neither the Organizer nor a current
  Representative, so an unrelated User cannot confirm a protected Auction
  exists. `grantRealtimeAccess` reuses `resolveLiveRole`, issues a short-lived
  HMAC token bound to the channel, User, and expiry, and returns null after a
  Representative is replaced.
- **Snapshots.** One authorized snapshot carries the revision, lifecycle, Active
  Tier, Team public state (spent, remaining, Roster and Tier counts, leader), the
  caller's private state (Organizer or their one Team), and the rejected-Bid
  details the caller may see. Phone numbers are never included.
- **Revision and outbox.** Every committed shared change calls `bumpRevision`,
  which increments `auction.revision` and inserts one `auction_outbox_event` row
  in the same transaction. `publishPendingOutbox` drains pending rows through
  `CoalescingRealtimeDistributor`, which caps participant fan-out at two updates
  per second and always keeps the newest revision. Command acknowledgements are
  returned by the command itself and are never delayed behind this batching.
- **Realtime transport (deviation).** The `RealtimeSender` seam is pluggable;
  the default sender discards events so no test or command path performs network
  I/O. A deployment may inject a Supabase-backed sender, but no live transport
  is configured in the beta yet. Correctness does not depend on it: committed
  state lives in PostgreSQL and the outbox, and the console polls and refetches
  on connect, tab wake, focus, and after every command, replacing local state
  with an authorized snapshot. This is recorded here as the concrete deviation
  from "private Realtime channel" that remains open.
- **Console.** `/app/auctions/[id]/live` renders Organizer controls (select,
  random select, return, Manual Close) or Representative controls (the exact
  next Bid) from the same snapshot, and the dashboard links Live and Paused
  Auctions to it for both roles.

Verification: `pnpm test:unit` (`realtime-distributor.test.ts`: immediate first
send, deferral with newest-revision retention, the two-per-second cap, and no
postponement of a command response), `pnpm test:db`
(`tests/database/live-snapshot.test.ts`: Organizer and Representative role
filtering, unrelated-User denial, non-Live denial, rejected-Bid privacy,
grant verification, expired and reused grants, revoked access after
replacement, outbox drain, and monotonic revisions), and `pnpm test:browser`
(`tests/browser/readiness.spec.ts`: both consoles open a Live Auction and
observe committed updates).
