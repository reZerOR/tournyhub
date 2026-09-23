# 03: Live Bidding Stream Jump Indicator

Status: resolved

## Comments

Updated `src/features/auctions/live/live-bidding-chat.tsx` to detect jump bids and render a styled `JUMP (+delta)` badge with a `Zap` icon in the live bidding stream.
Passed `nextBidAmount` from `live-console.tsx` to ensure exact increment detection.

## Description

Update `LiveBiddingChat` in `src/features/auctions/live/live-bidding-chat.tsx`:
- Detect when an accepted bid is a jump bid:
  - If it's an opening bid: `bid.amount > activePlayer.startingPrice`.
  - If it's a subsequent bid: `bid.amount - prevBid.amount > standardIncrement`.
- Render an accent `JUMP BID` badge and display the delta (e.g. `+550 cr`) on jump bids in the live stream.
