# 17: Pause, resume, and recover live state

**What to build:** Let the Organizer suspend live action safely and let every participant recover from stale or interrupted connections.

**Blocked by:** 16, Close Players with database-authoritative timers.

**Status:** resolved

- [x] The Organizer can pause a Live Auction at any time through the authoritative command path.
- [x] Pausing rejects new Bids, preserves the Active Player and leading Bid, stores any remaining close duration, and clears the running deadline.
- [x] Resuming creates a new database deadline from the stored remaining duration or restores the open manual state.
- [x] A representative cannot submit a Bid while Paused, disconnected, reconnecting, stale, or no longer assigned to the Team.
- [x] Every console displays current lifecycle, connection health, revision, and whether controls are safe to use.
- [x] Reconnection fetches a full snapshot before controls return, and a skipped revision forces the same replacement.
- [x] A pause racing an in-flight Bid produces one legal serialized result based on database lock order.
- [x] Representative replacement, session revocation, and User suspension remove command and subscription authority from an already open tab.
- [x] Integration and browser tests cover pause-versus-Bid contention, remaining-time preservation, repeated pause/resume, offline state, revision gaps, and lost authority.

## Comments

Implemented in `src/server/auction-command/lifecycle.ts` (`pauseAuction`,
`resumeAuction`, `findCompletionBlocker`), the `paused_state` and
`paused_remaining_ms` columns on `player_presentation`, the lifecycle section of
`src/auction-query/live-snapshot.ts`, and the pause, resume, and connection
state of the live console.

- **Pause.** `pauseAuction` is Organizer-only, requires a Live Auction, and
  runs under the Auction lock. It parks the running deadline as
  `paused_remaining_ms` on the Active Presentation and clears both deadlines, so
  no participant can act on a stale countdown. The Active Player and the
  leading Bid are untouched, and the Auction moves to `paused`. Offering and
  returning a Player are Live-only, so a Paused Auction can never start a
  countdown that nothing may finalize — the Organizer resumes first.
- **Resume.** `resumeAuction` rebuilds a Manual Close warning or a Timed Close
  deadline from the stored remaining duration, or restores a plain open Manual
  Close Presentation. A duration that had already expired becomes a deadline of
  database time plus zero, so the next due-only finalization closes it.
- **Bid rejection.** Bidding is refused while Paused (`auction_paused`), when
  the actor no longer represents the Team (`not_representative`), and when the
  expected revision is behind (`stale_revision`). The console disables the Bid
  control while Paused, while a snapshot is in flight, and once the connection
  is stale; a refused command leaves controls disabled until a fresh snapshot
  arrives.
- **Recovery.** Connect, reconnect, tab wake, focus, `online`, and every
  completed command replace the whole local state with one authorized snapshot,
  so a skipped revision and a stale connection both self-heal. The console
  always shows lifecycle, connection health, revision, and whether controls are
  safe to use.
- **Lost authority.** Authority is derived on the server for every command, so a
  replaced representative, a revoked session, and a suspended User lose command
  and snapshot access from an already open tab without a client-side check.

**Carried forward from issue 12.** No Realtime transport is configured in the
beta; the `RealtimeSender` seam is still pluggable and the default sender
discards events. Recovery therefore relies on the committed outbox row plus
periodic authorized snapshots, which is what the tests exercise.

Verification: `pnpm test:db` (`tests/database/live-pause-resume.test.ts`:
Organizer-only pause and non-Live refusal, preserved Player and leader with a
parked 20-second duration, a Bid refused while Paused, a resumed deadline within
the remaining duration, a parked and restored Manual Close warning, three
pause/resume cycles keeping one Active Player, resume-on-Live and stale-pause
refusals, a pause-versus-Bid race with exactly one accepted result, a replaced
representative losing Bid authority, and a replayed pause command), and
`pnpm test:browser` (`tests/browser/live-pause.spec.ts`: pause disables bidding
on the representative console and resume restores it, plus offline detection,
control unavailability, and convergence on the Organizer's revision after
reconnecting).
