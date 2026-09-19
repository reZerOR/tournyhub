# 15: Close Players manually

**What to build:** Let the Organizer close an Active Player through a three-second warning and produce exactly one Sale or Unsold result.

**Blocked by:** 14, Submit authoritative Bids.

**Status:** ready-for-agent

- [ ] In Manual Close mode, only the Organizer can begin a three-second closing warning for the Active Player.
- [ ] The warning uses a stored database deadline and appears consistently to every participant.
- [ ] A valid Bid during the warning atomically cancels the warning, accepts the Bid, and returns the presentation to Open.
- [ ] The Organizer can cancel the warning without changing the current leading Team or price.
- [ ] An idempotent finalization command creates one Sale for the committed leader after the warning deadline.
- [ ] If no valid Bid exists, finalization creates one Unsold result and places the Player in the Unsold Pool.
- [ ] The Sale updates the Team's Roster, spent Credits, remaining Credits, and Tier count in the same committed result.
- [ ] Duplicate finalizers, stale close commands, and Bid-versus-finalizer races cannot create two outcomes or accept a late Bid.
- [ ] Database and browser tests cover reopen, cancellation, Sale, Unsold, exact deadline ordering, retry, and shared final state.
