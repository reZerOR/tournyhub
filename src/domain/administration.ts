import { z } from "zod";

/**
 * Platform Administration.
 *
 * A Platform Administrator is an allowlisted platform role, granted outside
 * ordinary registration and Auction ownership. Administrators may suspend
 * Users, revoke their sessions, hide Auctions, and inspect protected Auction
 * data after entering a reason. They may never edit Auction content or change
 * an outcome: no module here writes a Team, a Rule, a Bid, a Sale, or a Result.
 */
export const MODERATION_ACTIONS = [
  "inspect_auction",
  "suspend_user",
  "restore_user",
  "revoke_sessions",
  "hide_auction",
  "unhide_auction",
  "bootstrap_administrator",
] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const MODERATION_REASON_MAX = 200;

/** The reason an administrator must supply before any moderation action. */
export const moderationReasonSchema = z
  .string()
  .trim()
  .min(1, "Enter a reason.")
  .max(
    MODERATION_REASON_MAX,
    `Keep the reason within ${MODERATION_REASON_MAX} characters.`,
  );

export const suspendUserInputSchema = z.object({
  reason: moderationReasonSchema,
  userId: z.string().min(1),
});

export type SuspendUserInput = z.input<typeof suspendUserInputSchema>;

export const restoreUserInputSchema = suspendUserInputSchema;
export const revokeSessionsInputSchema = suspendUserInputSchema;

export const auctionModerationInputSchema = z.object({
  auctionId: z.uuid(),
  reason: moderationReasonSchema,
});

export const inspectAuctionInputSchema = auctionModerationInputSchema;

export type AuctionModerationInput = z.input<
  typeof auctionModerationInputSchema
>;

/** The environment variable that bootstraps the very first administrator. */
export const ADMIN_BOOTSTRAP_ENV = "PLATFORM_ADMIN_BOOTSTRAP_EMAIL";

/** A moderation problem the administrator can act on. */
export class AdministrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdministrationError";
  }
}
