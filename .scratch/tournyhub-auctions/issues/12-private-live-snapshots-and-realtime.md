# 12: Connect private live Auction snapshots

**What to build:** Give the Organizer and assigned Team Representatives role-appropriate live consoles backed by private authoritative Auction state.

**Blocked by:** 11, Add Tiered Rules and Tier feasibility.

**Status:** ready-for-agent

- [ ] The Organizer and current Team Representatives can open the Live Auction, while unrelated Users receive no protected Auction details.
- [ ] The application server verifies membership before granting short-lived access to a private Auction Realtime channel.
- [ ] A full snapshot contains the current revision, lifecycle, Active Tier, queues, Team public state, and only the caller's authorized private details.
- [ ] The Organizer console exposes Organizer controls, while a representative console exposes controls only for its Team.
- [ ] Every committed shared state change increments a monotonic Auction revision and publishes an outbox-backed notification.
- [ ] Participant-wide fan-out is capped at two updates per second without delaying direct command responses.
- [ ] Connect, reconnect, tab wake, and revision gaps fetch a fresh authorized snapshot instead of reconstructing missing state in the browser.
- [ ] Browser clients never receive a database password, Supabase service credential, phone-number broadcast, or authorization decision from Realtime.
- [ ] Tests prove private channel denial, role filtering, revision recovery, coalesced fan-out, revoked access, and authoritative snapshot replacement.
