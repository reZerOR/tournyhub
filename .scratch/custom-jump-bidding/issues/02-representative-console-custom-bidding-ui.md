# 02: Representative Console Custom Bidding UI

Status: resolved

## Comments

Added Custom Jump Bid controls in `src/features/auctions/live/live-console.tsx`:
- 1-click primary button remains available for standard increment.
- Dedicated numeric input field with `Min: {nextBid}` placeholder and integer validation.
- Quick-add chips (`+100`, `+500`, `+1,000`, `+2,500`).
- "Bid Custom" action button, disabled when invalid, below minimum, or exceeding budget.
- Inline warnings for bids below minimum or exceeding budget.
- Enter key support for quick submission.
- Preserves typed input on incoming realtime snapshot events without clearing while typing.

## Description

Enhance the live bidding controls in `src/features/auctions/live/live-console.tsx` (and `src/features/auctions/live/live-stage-spotlight.tsx`):
- Maintain the primary 1-click button for the minimum next increment.
- Add an integrated Custom Bid section for Team Representatives when bidding is available:
  - Input field for entering a custom integer amount with dynamic placeholder `Min: {nextBid}`.
  - Quick-add chip buttons (e.g., `+100`, `+500`, `+1,000`, `+2,500`) to quickly stage jump increments.
  - "Bid Custom" button that executes `placeBidAction` with the entered custom amount.
  - Inline feedback/validation:
    - If user entered value `< nextBid`: inline warning "Minimum bid is now {nextBid}" and disable custom submit.
    - If user entered value `> remainingBudget`: inline warning "Exceeds remaining Budget" and disable custom submit.
  - Support `Enter` key inside the input to trigger the custom bid submission.
  - Clear custom input upon successful bid dispatch.
  - Keep typed value intact across realtime snapshots without auto-clearing while the user is typing.
