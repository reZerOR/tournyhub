# 01: Server-Authoritative Custom Bid Validation

Status: resolved

## Comments

Updated `src/server/auction-command/place-bid.ts` to validate that `amount` is an integer and `amount >= next`.
Updated `BID_REJECTION_MESSAGES.wrong_amount` in `src/domain/live.ts`.

## Description

Update `placeBid` in `src/server/auction-command/place-bid.ts` to accept custom jump bids:
- Opening bid: any integer `>= Starting Price`.
- Subsequent bid: any integer `>= currentBid.amount + bidIncrement`.
- Rejections:
  - If `!Number.isInteger(amount)` or `amount < minRequired`, reject with `reason: "wrong_amount"`.
  - Validate against remaining budget, roster limits, and `bidKeepsLegalCompletion`.
- Update `BID_REJECTION_MESSAGES.wrong_amount` in `src/domain/live.ts` to reflect minimum requirement (e.g., "That Bid is below the minimum required amount.").
