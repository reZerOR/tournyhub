import { z } from "zod";

import { DEFAULT_TIMED_CLOSE_SECONDS } from "@/domain/live";
import { PLAYER_ENTRY_LIMITS } from "@/domain/player-entry";

export const RULE_LIMITS = {
  budgetMax: 100_000_000,
  bidIncrementMax: 1_000_000,
  defaultStartingPriceMax: PLAYER_ENTRY_LIMITS.startingPriceMax,
  rosterMax: PLAYER_ENTRY_LIMITS.maxEntriesPerAuction,
  timedCloseSecondsMax: 3600,
  timedCloseSecondsMin: 1,
} as const;

export interface AuctionRuleSet {
  auctionId: string;
  budget: null | number;
  bidIncrement: null | number;
  defaultStartingPrice: null | number;
  rosterMax: null | number;
  rosterMin: null | number;
  /**
   * The whole-second Timed Close countdown every Player uses. It has a
   * database default, so it is always present even before the Organizer
   * configures Rules.
   */
  timedCloseSeconds: number;
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

/**
 * The Timed Close countdown length. A blank value keeps the 30-second
 * default so an Organizer switching to Timed Close is never blocked.
 */
export const timedCloseSecondsSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return DEFAULT_TIMED_CLOSE_SECONDS;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length === 0) return DEFAULT_TIMED_CLOSE_SECONDS;
      return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
    }
    return value;
  },
  z
    .number()
    .int("Enter a whole number of seconds.")
    .min(
      RULE_LIMITS.timedCloseSecondsMin,
      "Timed Close must last at least 1 second.",
    )
    .max(
      RULE_LIMITS.timedCloseSecondsMax,
      `Timed Close must last at most ${RULE_LIMITS.timedCloseSecondsMax} seconds.`,
    ),
);

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
    timedCloseSeconds: timedCloseSecondsSchema.default(
      DEFAULT_TIMED_CLOSE_SECONDS,
    ),
  })
  .refine((value) => value.rosterMin <= value.rosterMax, {
    message: "Minimum Roster size cannot exceed the maximum.",
    path: ["rosterMin"],
  });

export type SimpleRulesInput = z.input<typeof simpleRulesInputSchema>;

/**
 * The shared Tiered Rules. Tiered Rules use the same Budget, Bid Increment,
 * and total Roster limits; each Tier supplies its own Starting Price and
 * per-Team counts.
 */
export const tieredRulesInputSchema = z
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
    timedCloseSeconds: timedCloseSecondsSchema.default(
      DEFAULT_TIMED_CLOSE_SECONDS,
    ),
  })
  .refine((value) => value.rosterMin <= value.rosterMax, {
    message: "Minimum Roster size cannot exceed the maximum.",
    path: ["rosterMin"],
  });

export type TieredRulesInput = z.input<typeof tieredRulesInputSchema>;

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
 * The Tiered Rules the Organizer must supply before a Tiered Auction can
 * start. Tiered Rules share the Budget, Bid Increment, and total Roster
 * limits; each Tier supplies its own Starting Price and per-Team counts.
 */
export function isTieredRuleSetComplete(
  ruleSet: AuctionRuleSet,
): ruleSet is AuctionRuleSet & {
  bidIncrement: number;
  budget: number;
  rosterMax: number;
  rosterMin: number;
} {
  const { bidIncrement, budget, rosterMax, rosterMin } = ruleSet;

  return (
    budget !== null &&
    budget >= 1 &&
    bidIncrement !== null &&
    bidIncrement >= 1 &&
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

/**
 * The Starting Price a Player is offered at under the Auction's Rule mode: the
 * Player's override, otherwise the Tier's Starting Price under Tiered Rules,
 * otherwise the Auction default. Callers pass `tierStartingPrice` only for a
 * Tiered Auction, so Simple Rules fall straight through to the default.
 */
export function resolveOfferedStartingPrice({
  defaultStartingPrice,
  startingPriceOverride,
  tierStartingPrice,
}: {
  defaultStartingPrice: null | number;
  startingPriceOverride: null | number;
  tierStartingPrice?: null | number;
}): number {
  return (
    startingPriceOverride ?? tierStartingPrice ?? defaultStartingPrice ?? 0
  );
}
