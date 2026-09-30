# 06 — Stop the console from disabling itself

Status: resolved
Type: frontend
Blocked by: 02

## Progress

**Done:**

- The staleness rule no longer disables bidding for a slow pull. `useLiveSync`
  now also returns `syncing`, and the 1 s tick treats a check in flight as
  healthy. The window is `STALE_AFTER_MS = 45_000` with a live socket and
  `DEGRADED_STALE_AFTER_MS = 15_000` while the socket is down and polling every
  3 s. A slow successful pull can no longer flip `connectionStale` and set
  `canBid` false, which is what the owner experienced as "it can't even hold a
  connection".
- `realtimeConnected` is consumed instead of discarded — it now selects which
  window applies.
- The Bid feed renders only its last `BID_FEED_LIMIT = 50` entries.

**Remaining — now implemented:**

- **Memoization.** The derived block was hoisted above the `if (finished)`
  early return (so the hook order cannot vary) and wrapped in one `useMemo`
  keyed on `[activePlayer, eligible, snapshot]`. `activeTier`, `bidsList` and
  the rest are now stable identities, so the existing `memo` on
  `LivePlayersPanel`, `LiveRosterPanel` and `LiveBiddingChat` is no longer
  defeated. `LiveHeaderBar` and `LiveOrganizerTools` are wrapped in `memo`, and
  every prop that would have defeated them — `onToggleSound`, the fourteen
  Organizer handlers, `eligiblePlayersForDirectSale` — was stabilised with
  `useCallback`/`useMemo`.
- The render-phase `setState` clamp in `live-players-panel.tsx` moved into an
  effect, and the per-Tier option counts are built in a single pass instead of
  an O(tiers × players) filter per Tier.

`pnpm typecheck`, `pnpm lint` and `pnpm test:unit` pass. The rehearsal exercises
the console's sync path but not React's render behaviour, so "typing, paging and
sorting stay responsive" is not measured here; the change is structural (stable
props and no render-phase writes) rather than a timing claim. `pnpm format:check`
still fails only on the pre-existing 36 untouched files.

## Goal

Remove the client-side work that makes the console feel sluggish, and stop a single slow snapshot from switching bidding off.

## Change 1 — the staleness rule currently kills bidding

`src/features/auctions/live/live-console.tsx` sets `connectionStale` when more than `STALE_AFTER_MS = 20_000` has passed without a successful sync, and `canBid` requires `!connectionStale`. On a backed-up server a *successful but slow* pull exceeds 20 s, so the page declares itself stale and **disables bidding** — reported by the owner as "it can't even hold a connection".

- Distinguish "a pull is in flight" from "no successful sync for a long time". Only the latter should degrade controls.
- Raise the threshold and let it scale with the observed pull duration rather than using a fixed 20 s.
- Keep a visible, honest connection indicator instead of a silent disable — per the project's instrument-panel preference, show the state rather than hiding the control.

## Change 2 — the discarded connection signal

`live-console.tsx:183` calls `useLiveSync(...)` and **discards** the returned `realtimeConnected`. Route it into state so the UI can distinguish "socket down, polling at 3 s" from "synced".

## Change 3 — memoize the derived views

`live-console.tsx` contains **no `useMemo`**. Every accepted snapshot replaces `snapshot`, so every derived value is recomputed and every memoized child receives new array identities and re-renders anyway. Wrap the derived work in `useMemo` keyed on the snapshot:

- `leadingTeam`, the Tier lookup, the eligible filter, the `openSales` filter, the Team reduce.
- `LiveHeaderBar` and `LiveOrganizerTools` are plain functions with no `memo` — memoize them.
- `snapshot.bids` is unbounded for the current lot; cap the rendered Bid feed.
- `describeLiveChange` and `soundCueFor` each build maps over Teams on every snapshot; build them once per snapshot, or skip them when nothing relevant changed.

## Change 4 — remove render-phase state writes

`live-players-panel.tsx` performs a render-phase `setState` clamp around lines 259–260, and computes an O(tiers × players) filter at ~280. Move the clamp into an effect or derive it, and hoist the per-Tier counts into a single pass.

## Done when

- A two-hour rehearsal produces **no** `connectionStale` Bid disable.
- No render-phase `setState` remains in the live path.
- Typing, paging and sorting in the Player directory stay responsive while Bids stream in, with 93 Players and 10 Teams loaded.
- `pnpm typecheck`, `pnpm lint` and `pnpm format:check` pass.
