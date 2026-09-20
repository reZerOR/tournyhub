import { z } from "zod";

import { PLAYER_ENTRY_LIMITS } from "@/domain/player-entry";

export const TIER_LIMITS = {
  labelMax: 60,
  maxTiers: 24,
  startingPriceMax: PLAYER_ENTRY_LIMITS.startingPriceMax,
} as const;

export interface Tier {
  auctionId: string;
  createdAt: Date;
  id: string;
  label: string;
  /** The shared minimum Player count for every Team in this Tier. */
  maxPerTeam: number;
  minPerTeam: number;
  normalizedLabel: string;
  position: number;
  /** The Tier's default Starting Price for its Players. */
  startingPrice: number;
  updatedAt: Date;
}

/**
 * A stable comparison key for Tier labels. Case, surrounding whitespace, and
 * repeated internal whitespace do not make two labels distinct.
 */
export function normalizeTierLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The sum of every Tier's shared minimum, across any label-shaped Tier list. */
export function sumTierMinimums(
  tiers: readonly { minPerTeam: number }[],
): number {
  return tiers.reduce((total, tier) => total + tier.minPerTeam, 0);
}

export function sumTierMaximums(
  tiers: readonly { maxPerTeam: number }[],
): number {
  return tiers.reduce((total, tier) => total + tier.maxPerTeam, 0);
}

function wholeNumber(
  minimum: number,
  maximum: number,
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
      .min(minimum, minimumMessage)
      .max(maximum, maximumMessage),
  );
}

export const tierLabelSchema = z
  .string()
  .trim()
  .min(1, "Enter a Tier name.")
  .max(
    TIER_LIMITS.labelMax,
    `Keep Tier names within ${TIER_LIMITS.labelMax} characters.`,
  )
  .transform((value) => value.replace(/\s+/g, " "));

export const tierInputSchema = z
  .object({
    label: tierLabelSchema,
    maxPerTeam: wholeNumber(
      1,
      PLAYER_ENTRY_LIMITS.maxEntriesPerAuction,
      "Maximum per Team must be at least 1.",
      `Maximum per Team must be at most ${PLAYER_ENTRY_LIMITS.maxEntriesPerAuction}.`,
    ),
    minPerTeam: wholeNumber(
      0,
      PLAYER_ENTRY_LIMITS.maxEntriesPerAuction,
      "Minimum per Team cannot be negative.",
      `Minimum per Team must be at most ${PLAYER_ENTRY_LIMITS.maxEntriesPerAuction}.`,
    ),
    startingPrice: wholeNumber(
      1,
      TIER_LIMITS.startingPriceMax,
      "Starting Price must be at least 1 Credit.",
      `Starting Price must be at most ${TIER_LIMITS.startingPriceMax.toLocaleString()} Credits.`,
    ),
  })
  .refine((value) => value.minPerTeam <= value.maxPerTeam, {
    message: "Minimum per Team cannot exceed the maximum.",
    path: ["minPerTeam"],
  });

export type TierInput = z.input<typeof tierInputSchema>;

export const tierOrderSchema = z.object({
  orderedTierIds: z
    .array(z.uuid("A Tier id must be a UUID."))
    .min(1, "Keep at least one Tier."),
});

export type TierOrderInput = z.input<typeof tierOrderSchema>;
