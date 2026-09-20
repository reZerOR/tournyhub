import { z } from "zod";

/**
 * Authenticated beta feedback.
 *
 * A submission records only the page the User was on, their internal User
 * identifier, a category, and the message. It deliberately has no field for a
 * Team, an Auction, a snapshot, or a credential, so the application can never
 * attach protected Auction data, a phone number, an OTP, a session value, or an
 * invitation token — not even by accident.
 */
export const FEEDBACK_CATEGORIES = [
  "bug",
  "confusing",
  "missing",
  "performance",
  "other",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Something is broken",
  confusing: "Something is confusing",
  missing: "Something is missing",
  other: "Other",
  performance: "Something is slow",
};

export const FEEDBACK_LIMITS = {
  messageMax: 2000,
  messageMin: 10,
  /** How many submissions one User may make per rolling hour. */
  submissionsPerHour: 5,
  pageMax: 200,
  /** How long a stored report is kept before the operator may prune it. */
  retentionDays: 90,
} as const;

/**
 * The page a report claims to come from. It must be an internal application
 * path, so a report cannot smuggle an external URL or a query string that
 * carries a token.
 */
const pageSchema = z
  .string()
  .trim()
  .max(FEEDBACK_LIMITS.pageMax)
  .refine((value) => value.startsWith("/app"), {
    message: "Only TournyHub pages can be reported.",
  })
  .refine((value) => !value.includes("?") && !value.includes("#"), {
    message: "Only TournyHub pages can be reported.",
  })
  .refine((value) => !value.startsWith("//"), {
    message: "Only TournyHub pages can be reported.",
  });

export const submitFeedbackInputSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES, "Choose a category."),
  message: z
    .string()
    .trim()
    .min(
      FEEDBACK_LIMITS.messageMin,
      `Describe the problem in at least ${FEEDBACK_LIMITS.messageMin} characters.`,
    )
    .max(
      FEEDBACK_LIMITS.messageMax,
      `Keep the message within ${FEEDBACK_LIMITS.messageMax} characters.`,
    ),
  page: pageSchema,
});

export type SubmitFeedbackInput = z.input<typeof submitFeedbackInputSchema>;

export interface FeedbackResult {
  createdAt: Date;
  id: string;
}

/**
 * The message as it may be shown back to the User. It is plain text: no HTML is
 * interpreted, so a message cannot inject markup into a later moderation view.
 */
export function sanitizeFeedbackMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}
