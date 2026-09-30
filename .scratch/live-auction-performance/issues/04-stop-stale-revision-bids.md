# 04 — Stop sending Bids that cannot win

Status: resolved
Type: frontend

## Answer

`dispatch` (`live-console.tsx`) now returns its payload and no longer sets
`message` for a `stale_revision` rejection, so a timing artefact can never be
shown as a refused Bid. A new `submitBid()` helper retries once: a stale-revision
response already carries a fresh authorized snapshot (`settle()` always calls
`getLiveSnapshot`) and `accept()` has already replaced `previousSnapshot`, so the
retry recomputes from current state with no extra pull.

Both Bid controls go through it:
- the exact-price button resubmits `current.nextBidAmount`;
- the custom field re-sends the player's amount only while it is still legal for
  the state the retry will run against (`>= nextBidAmount` and within the
  remaining Budget), so a moved price can never cause a silently different Bid.

The server's `expectedRevision` check is deliberately unchanged; removing it is a
wider contract change that belongs in its own ticket, as the ticket notes.

Not done here: the custom-amount jump-Bid divergence from the product
specification. It needs a product decision before the field is restricted, so it
was left as the ticket describes.

Measured by ticket 07's rehearsal (39 Presentations, 195 Bid attempts):

- **0 `stale_revision` rejections (0%)** with refresh-and-retry, against
  **195/195 (100%)** when a console bids on a revision it never refreshes.
  Production's 46.9% sits between those two bounds, because a real console
  refreshes on every Broadcast. Target ≤ 5%: **met**.
- The rejections that remain are rule refusals rather than timing: 62
  `tier_max_reached` and 5 `no_legal_completion`.

## Goal

Remove the `stale_revision` rejection storm: 90 of 192 Bid attempts (46.9%) were refused because the client submitted an `expectedRevision` the server had already advanced past. Each refusal is still a full lock-holding transaction that inserts a `bid_attempt` row, a `command` row, and commits.

## Cause

`placeBidAction` sends `expectedRevision: snapshot.revision` from the caller's last snapshot. With ten Representatives bidding, the Revision advances faster than each client pulls it, so a Bid that is otherwise completely valid is refused before any of the real checks (Presentation state, deadline, leader, Budget, Roster, Tier, Legal Completion) run.

## Change — client (`src/features/auctions/live/live-console.tsx`)

1. **Preflight before submit.** When a Bid is dispatched, compare the Snapshot Revision with the Revision of the current lot's Presentation. If they are out of step, pull a fresh snapshot first and re-derive `nextBidAmount` before submitting.
2. **One silent retry.** If the action returns `stale_revision`, do not show the rejection message. Pull a fresh snapshot, recompute the next valid amount from the new state, and resubmit **once**. Only surface an error if the retry also fails.
3. Never submit while `pending` or while `connectionStale` — `canBid` already enforces this; keep it.

## Decision to record

Do **not** remove the server's `expectedRevision` check in this ticket. The server's other checks already cover the safety cases (a closed Presentation, a passed deadline, a Team already leading, an insufficient amount). Removing the check is a wider change to the command contract and belongs in its own ticket with its own ADR note, not here.

## Change — custom amount field

The flow document records that the custom amount field accepts jump Bids above the next price while the product specification describes an exact next-price Bid. Jump Bids widen the window in which a `stale_revision` rejection can occur. If the product intent is exact-price bidding, closing that divergence removes a further share of rejections; confirm the intent before changing it, and if it changes, update the flow document.

## Done when

A rehearsal with 11 concurrent sessions reports `stale_revision` at ≤ 5% of Bid attempts, and a refused Bid no longer surfaces a user-visible error when a retry can succeed.
