# 17: Pause, resume, and recover live state

**What to build:** Let the Organizer suspend live action safely and let every participant recover from stale or interrupted connections.

**Blocked by:** 16, Close Players with database-authoritative timers.

**Status:** ready-for-agent

- [ ] The Organizer can pause a Live Auction at any time through the authoritative command path.
- [ ] Pausing rejects new Bids, preserves the Active Player and leading Bid, stores any remaining close duration, and clears the running deadline.
- [ ] Resuming creates a new database deadline from the stored remaining duration or restores the open manual state.
- [ ] A representative cannot submit a Bid while Paused, disconnected, reconnecting, stale, or no longer assigned to the Team.
- [ ] Every console displays current lifecycle, connection health, revision, and whether controls are safe to use.
- [ ] Reconnection fetches a full snapshot before controls return, and a skipped revision forces the same replacement.
- [ ] A pause racing an in-flight Bid produces one legal serialized result based on database lock order.
- [ ] Representative replacement, session revocation, and User suspension remove command and subscription authority from an already open tab.
- [ ] Integration and browser tests cover pause-versus-Bid contention, remaining-time preservation, repeated pause/resume, offline state, revision gaps, and lost authority.
