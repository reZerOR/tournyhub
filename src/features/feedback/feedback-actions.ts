"use server";

import { z } from "zod";

import type { SubmitFeedbackInput } from "@/domain/feedback";
import {
  FeedbackError,
  submitFeedback,
} from "@/server/auction-command/feedback";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export type FeedbackActionResult =
  { status: "saved" } | { message: string; status: "error" };

/**
 * Records one beta report from the signed-in User. A failure message is always
 * one this module chose, so a database or service detail never reaches the
 * browser.
 */
export async function submitFeedbackAction(
  input: SubmitFeedbackInput,
): Promise<FeedbackActionResult> {
  const session = await getCurrentSession();
  if (!session) {
    return { message: "Sign in to send feedback.", status: "error" };
  }

  try {
    await submitFeedback(getPool(), session.user.id, input);
    return { status: "saved" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        message: error.issues[0]?.message ?? "Check the report and try again.",
        status: "error",
      };
    }
    if (error instanceof FeedbackError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}
