import { z } from "zod";

import { PLAYER_ENTRY_LIMITS } from "@/domain/player-entry";
import { RULE_LIMITS } from "@/domain/rules";

/**
 * Controlled changes to a running Auction. A Live Auction may only be changed
 * while Paused, and every accepted change is compensating: it never rewrites
 * accepted history, records an immutable Audit Entry, and announces itself to
 * every participant.
 */
export const MANAGE_REJECTION_REASONS = [
  "not_organizer",
  "auction_not_editable",
  "auction_not_paused",
  "auction_cancelled",
  "stale_revision",
  "reason_required",
  "team_not_in_auction",
  "tier_not_in_auction",
  "tier_already_opened",
  "representative_not_registered",
  "representative_email_unverified",
  "organizer_cannot_represent",
  "user_already_represents",
  "user_belongs_to_auction",
  "player_entry_unavailable",
  "invalid_amount",
  "maximum_below_current_count",
  "no_legal_completion",
  "player_limit_reached",
] as const;

export type ManageRejectionReason = (typeof MANAGE_REJECTION_REASONS)[number];

export const MANAGE_REJECTION_MESSAGES: Record<ManageRejectionReason, string> =
  {
    auction_cancelled: "This Auction is cancelled and read-only.",
    auction_not_editable:
      "A representative or the Organizer can only change while the Auction is a Draft, Ready, or Paused.",
    auction_not_paused: "Pause the Auction before this change.",
    invalid_amount: "Enter a whole number of at least 1 Credit.",
    maximum_below_current_count:
      "A maximum cannot be lowered below what a Team already holds.",
    no_legal_completion:
      "That change would leave no Legal Completion. Resolve the Auction first.",
    not_organizer: "Only the Organizer can do that.",
    organizer_cannot_represent:
      "The Organizer cannot represent a Team in their own Auction.",
    player_entry_unavailable:
      "That Player Entry is already sold, offered, or represents another Team.",
    player_limit_reached:
      "This Auction already holds the maximum number of Player Entries.",
    reason_required: "Enter a reason of at most 200 characters.",
    representative_email_unverified:
      "That email does not belong to a registered, verified User.",
    representative_not_registered:
      "That email does not belong to a registered, verified User.",
    stale_revision: "The Auction changed. Refresh before continuing.",
    team_not_in_auction: "That Team is not in this Auction.",
    tier_already_opened:
      "Players can only be added to a Tier that has not been offered yet.",
    tier_not_in_auction: "That Tier is not in this Auction.",
    user_already_represents:
      "That User already represents another Team in this Auction.",
    user_belongs_to_auction:
      "That User represents a Team in this Auction, so they cannot take ownership.",
  };

/** The states in which a controlled change may be made. */
export const MANAGE_STATUSES = ["draft", "ready", "paused"] as const;

/** The managed changes that require the Auction to be Paused. */
export const PAUSED_ONLY_CHANGES = [
  "increase_budget",
  "add_players",
  "change_constraints",
  "cancel_auction",
] as const;

export const MANAGE_REASON_MAX = 200;

const reasonSchema = z
  .string()
  .trim()
  .min(1, "Enter a reason of at most 200 characters.")
  .max(MANAGE_REASON_MAX, "Enter a reason of at most 200 characters.");

const wholeCredits = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
    }
    return value;
  },
  z
    .number()
    .int("Enter a whole number of Credits.")
    .min(1, "Enter a whole number of Credits.")
    .max(
      RULE_LIMITS.budgetMax,
      `Enter at most ${RULE_LIMITS.budgetMax.toLocaleString()} Credits.`,
    ),
);

/** A permanent, equally applied increase to every Team's Budget. */
export const increaseBudgetInputSchema = z.object({
  amount: wholeCredits,
  reason: reasonSchema,
});

export type IncreaseBudgetInput = z.input<typeof increaseBudgetInputSchema>;

const optionalPositiveInteger = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  }
  return value;
}, z.number().int().min(1).max(RULE_LIMITS.rosterMax).optional());

/**
 * The permitted Rule changes while Paused. Starting Prices, Bid Increment, and
 * the Single-Live rule are locked once bidding starts; only Roster and Tier
 * minimums and maximums may move, and only within the guards the command
 * applies.
 */
export const changeConstraintsInputSchema = z.object({
  reason: reasonSchema,
  rosterMax: optionalPositiveInteger,
  rosterMin: optionalPositiveInteger,
  tiers: z
    .array(
      z.object({
        maxPerTeam: z.number().int().min(1).max(RULE_LIMITS.rosterMax),
        minPerTeam: z.number().int().min(0).max(RULE_LIMITS.rosterMax),
        tierId: z.uuid(),
      }),
    )
    .default([]),
});

export type ChangeConstraintsInput = z.input<
  typeof changeConstraintsInputSchema
>;

export const pausedPlayerSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a Display name.").max(100),
  externalPlayerId: z.string().trim().max(100).optional(),
  phoneNumber: z.string().trim().max(40).optional(),
  role: z.string().trim().max(60).optional(),
  tierId: z.uuid().nullish(),
});

export type PausedPlayerInput = z.input<typeof pausedPlayerSchema>;

/** New Player Entries added to a running Auction. */
export const addPausedPlayersInputSchema = z.object({
  players: z
    .array(pausedPlayerSchema)
    .min(1, "Add at least one Player Entry.")
    .max(PLAYER_ENTRY_LIMITS.maxEntriesPerAuction),
  reason: reasonSchema,
});

export type AddPausedPlayersInput = z.input<typeof addPausedPlayersInputSchema>;

export const replaceRepresentativeInputSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  playerEntryId: z.uuid().nullish(),
  reason: reasonSchema,
  teamId: z.uuid(),
});

export type ReplaceRepresentativeInput = z.input<
  typeof replaceRepresentativeInputSchema
>;

export const transferOwnershipInputSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  reason: reasonSchema,
});

export type TransferOwnershipInput = z.input<
  typeof transferOwnershipInputSchema
>;

export const cancelAuctionInputSchema = z.object({
  reason: reasonSchema,
});

export type CancelAuctionInput = z.input<typeof cancelAuctionInputSchema>;

/** The cancellation reason stored on the Auction, kept short and immutable. */
export function describeCancellation(reason: string): string {
  return `The Organizer cancelled the Auction: ${reason.trim()}`;
}
