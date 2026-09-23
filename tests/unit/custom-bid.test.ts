import { describe, expect, it } from "vitest";

import { BID_REJECTION_MESSAGES, nextBidAmount } from "@/domain/live";

describe("Custom Jump Bidding Domain & Calculation", () => {
  it("computes the minimum next bid from the starting price or current high bid", () => {
    // When no bids exist, minimum is the starting price
    expect(
      nextBidAmount({
        bidIncrement: 200,
        currentAmount: null,
        startingPrice: 1000,
      }),
    ).toBe(1000);

    // When a standard bid exists
    expect(
      nextBidAmount({
        bidIncrement: 200,
        currentAmount: 1200,
        startingPrice: 1000,
      }),
    ).toBe(1400);

    // When an unaligned custom jump bid exists (e.g. 1550), next minimum adds the increment
    expect(
      nextBidAmount({
        bidIncrement: 200,
        currentAmount: 1550,
        startingPrice: 1000,
      }),
    ).toBe(1750);
  });

  it("validates that custom bids must be integers meeting or exceeding the minimum next bid", () => {
    const startingPrice = 1000;
    const bidIncrement = 200;

    function validateBidAmount({
      amount,
      currentAmount,
    }: {
      amount: number;
      currentAmount: number | null;
    }): { reason?: string; valid: boolean } {
      const minRequired = nextBidAmount({
        bidIncrement,
        currentAmount,
        startingPrice,
      });

      if (!Number.isInteger(amount) || amount < minRequired) {
        return { reason: "wrong_amount", valid: false };
      }
      return { valid: true };
    }

    // Opening bids:
    // Starting price is valid
    expect(validateBidAmount({ amount: 1000, currentAmount: null })).toEqual({
      valid: true,
    });
    // Jump opening bid (e.g. 1550) is valid
    expect(validateBidAmount({ amount: 1550, currentAmount: null })).toEqual({
      valid: true,
    });
    // Bid below starting price is rejected
    expect(validateBidAmount({ amount: 999, currentAmount: null })).toEqual({
      reason: "wrong_amount",
      valid: false,
    });
    // Decimal amounts rejected
    expect(validateBidAmount({ amount: 1550.5, currentAmount: null })).toEqual({
      reason: "wrong_amount",
      valid: false,
    });

    // Subsequent bids after 1000:
    // Standard next bid (1200) is valid
    expect(validateBidAmount({ amount: 1200, currentAmount: 1000 })).toEqual({
      valid: true,
    });
    // Jump bid (1550) is valid
    expect(validateBidAmount({ amount: 1550, currentAmount: 1000 })).toEqual({
      valid: true,
    });
    // Bid below minimum (1100 < 1200) is rejected
    expect(validateBidAmount({ amount: 1100, currentAmount: 1000 })).toEqual({
      reason: "wrong_amount",
      valid: false,
    });
    // Decimal amount (1300.25) is rejected
    expect(validateBidAmount({ amount: 1300.25, currentAmount: 1000 })).toEqual(
      {
        reason: "wrong_amount",
        valid: false,
      },
    );

    // Subsequent bids after custom jump 1550 (next min is 1750):
    expect(validateBidAmount({ amount: 1750, currentAmount: 1550 })).toEqual({
      valid: true,
    });
    expect(validateBidAmount({ amount: 2000, currentAmount: 1550 })).toEqual({
      valid: true,
    });
    expect(validateBidAmount({ amount: 1600, currentAmount: 1550 })).toEqual({
      reason: "wrong_amount",
      valid: false,
    });
  });

  it("detects jump bids and computes the delta accurately", () => {
    const startingPrice = 1000;
    const bidIncrement = 200;

    function detectJump({
      amount,
      isOpening,
      previousAmount,
    }: {
      amount: number;
      isOpening: boolean;
      previousAmount: number;
    }) {
      const delta = amount - previousAmount;
      const isJump = isOpening ? amount > startingPrice : delta > bidIncrement;
      return { delta, isJump };
    }

    // Standard opening at starting price -> not a jump
    expect(
      detectJump({ amount: 1000, isOpening: true, previousAmount: 1000 }),
    ).toEqual({ delta: 0, isJump: false });

    // Jump opening at 1550 -> jump with delta 550
    expect(
      detectJump({ amount: 1550, isOpening: true, previousAmount: 1000 }),
    ).toEqual({ delta: 550, isJump: true });

    // Standard increment from 1000 to 1200 (+200) -> not a jump
    expect(
      detectJump({ amount: 1200, isOpening: false, previousAmount: 1000 }),
    ).toEqual({ delta: 200, isJump: false });

    // Jump bid from 1000 to 1550 (+550) -> jump with delta 550
    expect(
      detectJump({ amount: 1550, isOpening: false, previousAmount: 1000 }),
    ).toEqual({ delta: 550, isJump: true });
  });

  it("has a clear rejection message for bids below the minimum", () => {
    expect(BID_REJECTION_MESSAGES.wrong_amount).toBe(
      "That Bid is below the minimum required amount.",
    );
  });
});
