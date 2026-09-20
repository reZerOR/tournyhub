import type { Pool } from "pg";

import {
  FEEDBACK_LIMITS,
  submitFeedbackInputSchema,
  type FeedbackResult,
  type SubmitFeedbackInput,
} from "@/domain/feedback";

/** A feedback problem the User can act on, as opposed to an unexpected failure. */
export class FeedbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackError";
  }
}

/**
 * Records one authenticated beta report. The page, category, message, the
 * User's internal identifier, and the server timestamp are stored; nothing else
 * is read from the caller, so a report cannot carry Auction data, a phone
 * number, an OTP, a session value, or an invitation token.
 *
 * A rolling hourly limit bounds how often one User may submit, so the form
 * cannot be used as a bulk channel. Throws `FeedbackError` when the limit is
 * reached.
 */
export async function submitFeedback(
  pool: Pool,
  userId: string,
  input: SubmitFeedbackInput,
): Promise<FeedbackResult> {
  const parsed = submitFeedbackInputSchema.parse(input);

  const recent = await pool.query<{ count: number }>(
    `select count(*)::int as count from "feedback"
      where "user_id" = $1 and "created_at" > now() - interval '1 hour'`,
    [userId],
  );
  if (recent.rows[0]!.count >= FEEDBACK_LIMITS.submissionsPerHour) {
    throw new FeedbackError(
      `You have sent ${FEEDBACK_LIMITS.submissionsPerHour} reports this hour. Try again later.`,
    );
  }

  const inserted = await pool.query<{ created_at: Date; id: string }>(
    `insert into "feedback" ("user_id", "page", "category", "message")
     values ($1, $2, $3, $4)
     returning "id", "created_at"`,
    [userId, parsed.page, parsed.category, parsed.message],
  );

  return {
    createdAt: inserted.rows[0]!.created_at,
    id: inserted.rows[0]!.id,
  };
}
