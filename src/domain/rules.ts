import { z } from "zod";

import { PLAYER_ENTRY_LIMITS } from "@/domain/player-entry";

export const RULE_LIMITS = {
  budgetMax: 100_000_000,
  bidIncrementMax: 1_000_000,
  defaultStartingPriceMax: PLAYER_ENTRY_LIMITS.startingPriceMax,
  rosterMax: PLAYER_ENTRY_LIMITS.maxEntriesPerAuction,
} as const;

export interface AuctionRuleSet {
  auctionId: string;
  budget: null | number;
  bidIncrement: null | number;
  defaultStartingPrice: null | number;
  rosterMax: null | number;
  rosterMin: null | number;
  updatedAt: Date;
}

function wholeNumber(
  max: number,
  minimumMessage: string,
  maximumMessage: string,
) {
  return z.preprocess(
    (value) => {
      if (value === null || value === undefined) return value;
      if (typeof value === "string") {
        const trimmed = value.trim();
        return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
      }
      return value;
    },
    z
      .number()
      .int("Enter a whole number.")
      .min(1, minimumMessage)
      .max(max, maximumMessage),
  );
}

export const simpleRulesInputSchema = z
  .object({
    budget: wholeNumber(
      RULE_LIMITS.budgetMax,
      "Budget must be at least 1 Credit.",
      `Budget must be at most ${RULE_LIMITS.budgetMax.toLocaleString()} Credits.`,
    ),
    bidIncrement: wholeNumber(
      RULE_LIMITS.bidIncrementMax,
      "Bid Increment must be at least 1 Credit.",
      `Bid Increment must be at most ${RULE_LIMITS.bidIncrementMax.toLocaleString()} Credits.`,
    ),
    defaultStartingPrice: wholeNumber(
      RULE_LIMITS.defaultStartingPriceMax,
      "Starting Price must be at least 1 Credit.",
      `Starting Price must be at most ${RULE_LIMITS.defaultStartingPriceMax.toLocaleString()} Credits.`,
    ),
    rosterMax: wholeNumber(
      RULE_LIMITS.rosterMax,
      "Maximum Roster size must be at least 1.",
      `Maximum Roster size must be at most ${RULE_LIMITS.rosterMax}.`,
    ),
    rosterMin: wholeNumber(
      RULE_LIMITS.rosterMax,
      "Minimum Roster size must be at least 1.",
      `Minimum Roster size must be at most ${RULE_LIMITS.rosterMax}.`,
    ),
  })
  .refine((value) => value.rosterMin <= value.rosterMax, {
    message: "Minimum Roster size cannot exceed the maximum.",
    path: ["rosterMin"],
  });

export type SimpleRulesInput = z.input<typeof simpleRulesInputSchema>;

/** The Simple Rules the Organizer must supply before an Auction can start. */
export function isSimpleRuleSetComplete(
  ruleSet: AuctionRuleSet,
): ruleSet is AuctionRuleSet & {
  budget: number;
  bidIncrement: number;
  defaultStartingPrice: number;
  rosterMax: number;
  rosterMin: number;
} {
  const { bidIncrement, budget, defaultStartingPrice, rosterMax, rosterMin } =
    ruleSet;

  return (
    budget !== null &&
    budget >= 1 &&
    bidIncrement !== null &&
    bidIncrement >= 1 &&
    defaultStartingPrice !== null &&
    defaultStartingPrice >= 1 &&
    rosterMin !== null &&
    rosterMin >= 1 &&
    rosterMax !== null &&
    rosterMax >= rosterMin
  );
}

/**
 * The Starting Price a Player is offered at: the Player's own override when
 * present, otherwise the Auction's default.
 */
export function resolveStartingPrice(
  startingPriceOverride: null | number,
  defaultStartingPrice: number,
): number {
  return startingPriceOverride ?? defaultStartingPrice;
}
