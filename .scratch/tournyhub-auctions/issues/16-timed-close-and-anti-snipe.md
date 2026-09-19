# 16: Close Players with database-authoritative timers

**What to build:** Let a Timed Close Auction finish Player bidding from a database deadline with a final-five-second response window.

**Blocked by:** 15, Close Players manually.

**Status:** ready-for-agent

- [ ] The Organizer can configure one positive whole-second Timed Close duration, defaulting to 30 seconds, before the Auction starts.
- [ ] Activating a Player in Timed Close mode stores a deadline derived from PostgreSQL time.
- [ ] A valid Bid received during the final five seconds atomically moves the deadline to database time plus five seconds.
- [ ] A Bid received after the authoritative deadline is rejected even if a browser still displays remaining time.
- [ ] When a browser countdown reaches zero, it disables bidding and shows Finalizing until a committed result arrives.
- [ ] Refreshing, reconnecting, sleeping, or changing a client clock cannot extend, shorten, or finalize the presentation.
- [ ] Any eligible wake-up request may trigger idempotent due-only finalization, but duplicate callers still create one outcome.
- [ ] Database tests repeatedly cover Bid-versus-finalizer contention at the deadline, duplicate finalizers, anti-snipe updates, and client clock differences.
- [ ] Browser tests cover countdown display, final-five-second reset, Finalizing state, refresh, reconnect, Sale, and Unsold outcomes.
