# Custom Jump Bidding Specification

Status: ready-for-agent

## Overview

TournyHub currently requires every Bid to match the exact next increment calculated by `nextBidAmount` (`starting_price` for opening bid, or `current_amount + bid_increment` for subsequent bids).

This feature introduces **Custom Jump Bidding**, allowing Team Representatives to submit custom integer amounts that meet or exceed the required minimum bid, while preserving the 1-click standard increment button for quick bidding.

## Requirements

### 1. Bidding Rules & Validation
- **Integer Values Only**: All bids must be positive whole-number Credits (no fractions or decimals).
- **Opening Bid**: The first bid on an Active Player can be the Starting Price or any custom integer `>= Starting Price`.
- **Subsequent Bids**: Any subsequent bid must be an integer `>= current_bid + bid_increment`. Any bid below the minimum is rejected as `wrong_amount`.
- **Next Minimum Bid Baseline**: After any accepted bid (standard or custom), the next minimum required bid is always `accepted_bid + bid_increment`.
- **Natural Constraints**: The custom bid is verified against the Team's remaining Budget, total/Tier Roster maximums, and `Legal Completion`.
- **Universal Availability**: Enabled across all auctions without requiring an organizer toggle.

### 2. Concurrency & Anti-Snipe
- **Server Serialization**: Bids are locked and processed in PostgreSQL arrival order (`FOR UPDATE` on `auction`).
- **Strict Revision Check**: If another bid commits while a custom bid request is in flight, the request is rejected with `stale_revision`.
- **Anti-Snipe Reset**: In Timed Close, any accepted bid in the final 5 seconds resets the countdown to 5 seconds. In Manual Close, any accepted bid cancels the closing warning and reopens bidding.

### 3. User Interface & Console Ergonomics
- **Primary 1-Click Button**: Continues to display and submit the standard next increment (`+200 -> 1,200`) with zero confirmation dialog.
- **Custom Bid Controls**:
  - Dedicated numeric input field with a dynamic placeholder (`Min: {nextBid}`).
  - Quick-add chips (`+100`, `+500`, `+1,000`, etc.) that stage jump amounts into the input.
  - "Bid Custom" submit button (disabled when empty, invalid, below minimum, or exceeding budget).
  - Inline helper/warning messages when typed amount is below the minimum or exceeds budget.
  - Submits on pressing `Enter` when valid.
  - Preserves user typed input on real-time snapshot updates.

### 4. Feed & Audit Trail
- Custom jump bids are highlighted in the live stream with a distinct `JUMP BID` badge and jump delta.
- Organizer corrections (cancelling a bid) restore the previous accepted `bid_attempt` and recalculate the next minimum bid from the restored amount.
