# 04: Integration and Unit Testing

Status: resolved

## Comments

- Added `tests/unit/custom-bid.test.ts` testing domain calculations, positive integer requirements, jump delta detection, and rejection messaging.
- Updated `tests/database/live-bidding.test.ts` to test wrong_amount below starting price and added a dedicated test case for custom jump bidding and subsequent minimum bid calculations.
- Verified all 216 unit tests across 27 suites pass cleanly with zero regressions.

## Description

Add and update tests for custom jump bidding:
- Unit tests verifying:
  - Valid custom opening bids (`>= Starting Price`).
  - Valid custom jump bids (`>= current + increment`).
  - Rejection of bids below minimum (`amount < minRequired`).
  - Rejection of non-integer or decimal amounts (`1550.5`).
  - Natural constraints enforcement (budget limits, legal completion).
- Run unit test suite and verify clean passes with zero regressions.
