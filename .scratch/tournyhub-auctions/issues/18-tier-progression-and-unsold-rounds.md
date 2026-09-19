# 18: Progress Tiers and run Unsold Rounds

**What to build:** Let the Organizer finish each Tier in order and reoffer unresolved Players without changing their Starting Prices.

**Blocked by:** 11, Add Tiered Rules and Tier feasibility; 17, Pause, resume, and recover live state.

**Status:** ready-for-agent

- [ ] A Tier is eligible to finish only after every available Player in it has received one completed presentation.
- [ ] The Organizer cannot activate a later Tier while an Active Player remains or while the current Tier still has unoffered Players.
- [ ] After a Tier finishes, the Organizer can activate the next Tier or start an Unsold Round from completed Tiers.
- [ ] An Unsold Round exposes only eligible Unsold Pool Players and tracks which Players have been offered during that round.
- [ ] The Organizer may run another Unsold Round without a fixed retry limit while the Auction remains legally completable.
- [ ] A reoffered Player keeps the frozen Starting Price and all prior presentations and Bid attempts remain in history.
- [ ] Closing an Unsold Round is blocked when unresolved minimums require the Forced Assignment or constrained matching flow.
- [ ] Every Tier and Unsold Round transition creates an Audit Entry and committed revision visible to participants.
- [ ] Tests cover complete and incomplete first passes, Simple Rules behavior, ordered Tier activation, repeat rounds, stale commands, and unchanged Starting Prices.
