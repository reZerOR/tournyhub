import { z } from "zod";

export const TEAM_LIMITS = {
  nameMax: 100,
  maxTeams: 32,
  recommendedMaxTeams: 16,
} as const;

export const REPRESENTATIVE_TYPES = ["player", "outside"] as const;

export type RepresentativeType = (typeof REPRESENTATIVE_TYPES)[number];

export interface Team {
  auctionId: string;
  color: null | string;
  createdAt: Date;
  id: string;
  logoStorageKey: null | string;
  name: null | string;
  normalizedName: null | string;
  position: number;
  representativeType: null | RepresentativeType;
  representativeUserId: null | string;
  updatedAt: Date;
}

/**
 * A stable comparison key for Team names. Case, surrounding whitespace, and
 * repeated internal whitespace do not make two names distinct.
 */
export function normalizeTeamName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export const teamNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a Team name.")
  .max(
    TEAM_LIMITS.nameMax,
    `Keep Team names within ${TEAM_LIMITS.nameMax} characters.`,
  )
  .transform((value) => value.replace(/\s+/g, " "));

/**
 * A Team color stored as a lowercase `#rrggbb` value. An empty value clears
 * the color.
 */
export const teamColorSchema = z.preprocess(
  (value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.length > 0 ? trimmed.toLowerCase() : null;
  },
  z
    .string()
    .regex(/^#[0-9a-f]{6}$/, "Enter a color like #1a2b3c.")
    .nullable(),
);

export const createTeamInputSchema = z.object({
  color: teamColorSchema.optional().default(null),
  name: teamNameSchema,
});

export type CreateTeamInput = z.input<typeof createTeamInputSchema>;

export const updateTeamInputSchema = z.object({
  color: teamColorSchema.optional().default(null),
  name: teamNameSchema,
});

export type UpdateTeamInput = z.input<typeof updateTeamInputSchema>;
