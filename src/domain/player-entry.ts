import { z } from "zod";

export const PLAYER_ENTRY_LIMITS = {
  customFieldLabel: 60,
  customFieldValue: 200,
  displayName: 100,
  externalPlayerId: 100,
  maxCustomFieldsPerAuction: 20,
  maxEntriesPerAuction: 2000,
  phoneNumber: 40,
  role: 60,
  startingPriceMax: 1_000_000,
} as const;

export interface PlayerEntry {
  auctionId: string;
  createdAt: Date;
  /** Custom Player Field id to stored value. Empty values are never stored. */
  customValues: Record<string, string>;
  displayName: string;
  externalPlayerId: null | string;
  id: string;
  phoneNumber: null | string;
  role: null | string;
  startingPriceOverride: null | number;
  updatedAt: Date;
}

export interface CustomPlayerField {
  auctionId: string;
  createdAt: Date;
  id: string;
  label: string;
  updatedAt: Date;
}

/**
 * A stable comparison key for display names. Case, surrounding whitespace, and
 * repeated internal whitespace do not make two names distinct.
 */
export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The normalized display names that more than one Player Entry shares. A shared
 * name is a warning, not an error, so callers still save the entries.
 */
export function findDuplicateDisplayNames(
  entries: readonly { displayName: string }[],
): Set<string> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = normalizeDisplayName(entry.displayName);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return new Set(
    [...counts].filter(([, count]) => count > 1).map(([key]) => key),
  );
}

function optionalText(max: number, message: string) {
  return z.preprocess((value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().max(max, message).nullable());
}

const optionalPhoneNumber = z.preprocess(
  (value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.length > 0 ? trimmed : null;
  },
  z
    .string()
    .max(
      PLAYER_ENTRY_LIMITS.phoneNumber,
      `Keep phone numbers within ${PLAYER_ENTRY_LIMITS.phoneNumber} characters.`,
    )
    .regex(/^[+()\d][\d\s().-]*$/, "Enter a valid phone number.")
    .refine(
      (value) => (value.match(/\d/g) ?? []).length >= 3,
      "Enter a valid phone number.",
    )
    .nullable(),
);

const optionalStartingPrice = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length === 0) return null;
      return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
    }
    return value;
  },
  z
    .number()
    .int("Enter a whole number.")
    .min(1, "Starting price must be at least 1 Credit.")
    .max(
      PLAYER_ENTRY_LIMITS.startingPriceMax,
      `Starting price must be at most ${PLAYER_ENTRY_LIMITS.startingPriceMax} Credits.`,
    )
    .nullable(),
);

export const playerEntryInputSchema = z.object({
  customValues: z
    .record(
      z.uuid(),
      z
        .string()
        .trim()
        .max(
          PLAYER_ENTRY_LIMITS.customFieldValue,
          `Keep custom values within ${PLAYER_ENTRY_LIMITS.customFieldValue} characters.`,
        ),
    )
    .optional()
    .default({}),
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a display name.")
    .max(
      PLAYER_ENTRY_LIMITS.displayName,
      `Keep display names within ${PLAYER_ENTRY_LIMITS.displayName} characters.`,
    ),
  externalPlayerId: optionalText(
    PLAYER_ENTRY_LIMITS.externalPlayerId,
    `Keep External Player IDs within ${PLAYER_ENTRY_LIMITS.externalPlayerId} characters.`,
  ),
  phoneNumber: optionalPhoneNumber,
  role: optionalText(
    PLAYER_ENTRY_LIMITS.role,
    `Keep roles within ${PLAYER_ENTRY_LIMITS.role} characters.`,
  ),
  startingPriceOverride: optionalStartingPrice,
});

/**
 * The loose shape a caller may supply for a Player Entry. Optional fields may be
 * omitted, empty, or null, and a starting price may arrive as a form string.
 * `playerEntryInputSchema` normalizes it to the stored form.
 */
export interface PlayerEntryInput {
  customValues?: Record<string, string>;
  displayName: string;
  externalPlayerId?: null | string;
  phoneNumber?: null | string;
  role?: null | string;
  startingPriceOverride?: null | number | string;
}

export const customPlayerFieldInputSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Enter a field label.")
    .max(
      PLAYER_ENTRY_LIMITS.customFieldLabel,
      `Keep field labels within ${PLAYER_ENTRY_LIMITS.customFieldLabel} characters.`,
    ),
});

export type CustomPlayerFieldInput = z.input<
  typeof customPlayerFieldInputSchema
>;
