"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdministrationError,
  type ModerationAction,
} from "@/domain/administration";
import {
  hideAuction,
  recordModerationInspection,
  restoreUser,
  revokeUserSessions,
  suspendUser,
  unhideAuction,
} from "@/server/auction-command/administration";
import {
  isPlatformAdministrator,
  loadModerationSummary,
  type ModerationSummary,
} from "@/server/auction-query/administration";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export type ModerationResult =
  | { action: ModerationAction; status: "done" }
  | { message: string; status: "error" };

export type InspectResult =
  | { status: "inspected"; summary: ModerationSummary }
  | { message: string; status: "error" };

function denial(): { message: string; status: "error" } {
  // A non-administrator learns nothing about whether the target exists.
  return { message: "You are not a Platform Administrator.", status: "error" };
}

function toError(error: unknown): { message: string; status: "error" } {
  if (error instanceof z.ZodError) {
    return {
      message: error.issues[0]?.message ?? "Check the request and try again.",
      status: "error",
    };
  }
  if (error instanceof AdministrationError) {
    return { message: error.message, status: "error" };
  }
  throw error;
}

async function requireAdministratorSession(): Promise<null | string> {
  const session = await getCurrentSession();
  if (!session) return null;
  const allowed = await isPlatformAdministrator(getPool(), session.user.id);
  return allowed ? session.user.id : null;
}

function done(action: ModerationAction): ModerationResult {
  revalidatePath("/app/admin");
  return { action, status: "done" };
}

export async function suspendUserAction(input: {
  reason: string;
  userId: string;
}): Promise<ModerationResult> {
  const actorUserId = await requireAdministratorSession();
  if (!actorUserId) return denial();
  try {
    const result = await suspendUser(getPool(), actorUserId, input);
    return result ? done("suspend_user") : denial();
  } catch (error) {
    return toError(error);
  }
}

export async function restoreUserAction(input: {
  reason: string;
  userId: string;
}): Promise<ModerationResult> {
  const actorUserId = await requireAdministratorSession();
  if (!actorUserId) return denial();
  try {
    const result = await restoreUser(getPool(), actorUserId, input);
    return result ? done("restore_user") : denial();
  } catch (error) {
    return toError(error);
  }
}

export async function revokeSessionsAction(input: {
  reason: string;
  userId: string;
}): Promise<ModerationResult> {
  const actorUserId = await requireAdministratorSession();
  if (!actorUserId) return denial();
  try {
    const result = await revokeUserSessions(getPool(), actorUserId, input);
    return result ? done("revoke_sessions") : denial();
  } catch (error) {
    return toError(error);
  }
}

export async function hideAuctionAction(input: {
  auctionId: string;
  reason: string;
}): Promise<ModerationResult> {
  const actorUserId = await requireAdministratorSession();
  if (!actorUserId) return denial();
  try {
    const result = await hideAuction(getPool(), actorUserId, input);
    return result ? done("hide_auction") : denial();
  } catch (error) {
    return toError(error);
  }
}

export async function unhideAuctionAction(input: {
  auctionId: string;
  reason: string;
}): Promise<ModerationResult> {
  const actorUserId = await requireAdministratorSession();
  if (!actorUserId) return denial();
  try {
    const result = await unhideAuction(getPool(), actorUserId, input);
    return result ? done("unhide_auction") : denial();
  } catch (error) {
    return toError(error);
  }
}

/**
 * Records the reason, then returns the read-only summary. The record is
 * committed before any protected data is returned, so an inspection is always
 * attributable.
 */
export async function inspectAuctionAction(input: {
  auctionId: string;
  reason: string;
}): Promise<InspectResult> {
  const actorUserId = await requireAdministratorSession();
  if (!actorUserId) return denial();
  try {
    const recorded = await recordModerationInspection(
      getPool(),
      actorUserId,
      input,
    );
    if (!recorded) return denial();
    const summary = await loadModerationSummary(getPool(), input.auctionId);
    if (!summary) {
      return { message: "That Auction no longer exists.", status: "error" };
    }
    return { status: "inspected", summary };
  } catch (error) {
    return toError(error);
  }
}
