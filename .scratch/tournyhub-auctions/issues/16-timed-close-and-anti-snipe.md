# 16: Close Players with database-authoritative timers

**What to build:** Let a Timed Close Auction finish Player bidding from a database deadline with a final-five-second response window.

**Blocked by:** 15, Close Players manually.

**Status:** resolved

- [x] The Organizer can configure one positive whole-second Timed Close duration, defaulting to 30 seconds, before the Auction starts.
- [x] Activating a Player in Timed Close mode stores a deadline derived from PostgreSQL time.
- [x] A valid Bid received during the final five seconds atomically moves the deadline to database time plus five seconds.
- [x] A Bid received after the authoritative deadline is rejected even if a browser still displays remaining time.
- [x] When a browser countdown reaches zero, it disables bidding and shows Finalizing until a committed result arrives.
- [x] Refreshing, reconnecting, sleeping, or changing a client clock cannot extend, shorten, or finalize the presentation.
- [x] Any eligible wake-up request may trigger idempotent due-only finalization, but duplicate callers still create one outcome.
- [x] Database tests repeatedly cover Bid-versus-finalizer contention at the deadline, duplicate finalizers, anti-snipe updates, and client clock differences.
- [x] Browser tests cover countdown display, final-five-second reset, Finalizing state, refresh, reconnect, Sale, and Unsold outcomes.

## Comments

Implemented in `auction_rule_set.timed_close_seconds` and the `close_deadline`
column in migration `20260921140000`, `timedCloseSecondsSchema` and
`DEFAULT_TIMED_CLOSE_SECONDS` in `src/domain/rules.ts` and
`src/domain/live.ts`, the deadline insert in `selectPlayer`, the anti-snipe
update in `placeBid`, the Timed branch of `finalizePresentation`, the Timed
Close field on the Rules setup page, and the countdown in the live console.

- **Configuration.** One whole-second duration between 1 and 3600, defaulting
  to 30, lives on the Auction Rule Set. It is saved with the rest of the Rules
  and can only change before the Auction starts. The field appears on the Rules
  page only for a Timed Close Auction.
- **Deadline authority.** Activating a Player writes
  `close_deadline = now() + timed_close_seconds` in the same transaction that
  creates the Presentation, so the deadline is always PostgreSQL time. The
  Organizer's Manual Close warning and the Timed Close deadline are mutually
  exclusive per close mode.
- **Anti-snipe.** A valid Bid that arrives with five seconds or less remaining
  moves `close_deadline` to database time plus five seconds inside the same
  committed transaction. A Bid arriving with more time left leaves the deadline
  untouched.
- **Finalization.** `finalizePresentation` is due-only: a Manual Close
  Presentation must have reached its warning deadline and a Timed Close
  Presentation its close deadline. Omitting the Presentation id finalizes
  whichever Presentation the Auction last offered, so any eligible wake-up
  request can trigger it; a rejected early call, a duplicate finalizer, and a
  repeated command ID all leave exactly one Sale or Unsold outcome.
- **Client clock.** The console measures every countdown against the offset
  between `serverTime` in the snapshot and the local clock, disables bidding at
  zero, and shows Finalizing until a committed snapshot removes the Active
  Player. A console that cannot reach the server keeps showing Finalizing
  rather than announcing an outcome of its own.

**Deviation.** A closing deadline that passes while the Auction is Paused is
rebuilt on Resume (see issue 17) rather than finalized, because Pausing clears
the running deadline by design. Finalization is refused while Paused.

Verification: `pnpm test:unit` (`rules.test.ts`: the 30-second default, a blank
value, a custom duration, and out-of-range rejection), `pnpm test:db`
(`tests/database/live-timed-close.test.ts`: stored database deadline, custom
duration, anti-snipe reset, an untouched deadline outside the final seconds, a
late Bid, too-early finalization, one Sale, an Unsold result, a wake-up
finalization without a Presentation id, duplicate finalizers, and a
Bid-versus-finalizer race), and `pnpm test:browser`
(`tests/browser/live-timed-close.spec.ts`: countdown display, Finalizing while
disconnected, a reconnect that fetches the committed Unsold result, a refresh
that cannot change it, and a final-second Bid that moves the deadline).
