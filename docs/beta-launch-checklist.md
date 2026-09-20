# Beta launch checklist

Status: Confirmed

This checklist is the operator's copy of the launch gates in
[the test and launch plan](test-and-launch-plan.md). The beta may open only when
every automated gate passes and every operator gate is attested. `pnpm
launch:gates` runs the automated gates and prints the operator gates; an
unattested operator gate is reported as pending, never assumed.

## Beta limits to state plainly

- One Live Auction at a time.
- 16 Teams recommended, 32 Teams maximum.
- At most 2,000 Player Entries per Auction.
- At most 40 connected browser tabs.
- A personal, non-commercial beta running on free provider plans.
- No availability SLA and no guaranteed response time.

## Automated gates

Run them all from a clean checkout with `pnpm check`, or individually:

| Gate | Command |
| --- | --- |
| Formatting | `pnpm format:check` |
| Linting | `pnpm lint` |
| Static types | `pnpm typecheck` |
| Environment configuration | `pnpm env:check` |
| Unit and property tests | `pnpm test:unit` |
| Database integration tests | `pnpm test:db` |
| Production build | `pnpm build` |
| Browser tests | `pnpm test:browser` |
| Migration status (no drift) | `pnpm migrate:status` |

## Operator gates

Attest each one by name: `pnpm launch:gates --attest <id> ...`.

| Id | Gate |
| --- | --- |
| `concurrency` | Equal-price Bids, Bid versus finalizer, duplicate finalizers, pause versus Bid, representative replacement, response-loss retry, revision gaps, and competing corrections all pass repeatedly. |
| `capacity` | A production-like rehearsal with 40 connected tabs reports a Bid p95 below 750 ms (target below 500 ms) and stays inside documented quota, lock-wait, and query-duration limits. `pnpm rehearsal:bid -- --teams 16 --tabs 40` produces the measurement; run it only against synthetic data. |
| `browsers` | Current and previous major Chrome, Edge, Firefox, and Safari pass the essential Organizer and representative flows. |
| `privacy` | No phone number appears in a PDF, a participant-wide Realtime message, an unauthorized snapshot, feedback, a URL, or a platform log. |
| `secrets` | Production secrets differ from development and Preview, are absent from source and client bundles, and pass a rotation check. |
| `recovery` | A backup restores into a separate environment and the operator completes a practice Auction. |
| `defects` | No unresolved critical or high-severity integrity, authorization, privacy, or data-loss defect remains. |

## Operator sequence

1. `pnpm setup:wizard` and complete every provider step.
2. `pnpm env:check` and `pnpm migrate:status`.
3. `pnpm backup --destination "<absolute path outside the project>"`.
4. `pnpm restore --artifact "<artifact>" --database-url "<a separate project>"`, then work through
   `RESTORE_VERIFICATION_CHECKS`.
5. `pnpm rehearsal:bid -- --teams 16 --tabs 40` against synthetic data, and a
   second run at `--teams 32`.
6. `pnpm launch:gates` with the operator attestations, and keep its output as
   the launch record.

## No-go conditions

Do not run a real Auction when any of these is true:

- A Bid can be accepted without a committed authoritative response.
- A timer outcome depends on a browser clock.
- An unrelated User, a former representative, a suspended User, or a
  hidden-Auction caller retains access.
- A phone number appears in a PDF, a participant-wide Realtime payload, a log,
  or an unauthorized snapshot.
- Bid, Sale, correction, or Audit history can be overwritten through a normal
  application path.
- A production restore has not been rehearsed.
- Provider quotas are already near a limit the Auction needs.
