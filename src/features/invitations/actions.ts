"use server";

import { redirect } from "next/navigation";

import {
  acceptTeamInvitation,
  InvitationError,
} from "@/server/auction-command/team-invitations";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export type AcceptInvitationResult =
  { message: string; status: "error" } | { status: "accepted" };

export async function acceptInvitationAction(
  token: string,
): Promise<AcceptInvitationResult> {
  const session = await getCurrentSession();
  if (!session) {
    return { message: "Sign in to accept this invitation.", status: "error" };
  }

  try {
    await acceptTeamInvitation(getPool(), session.user.id, token);
  } catch (error) {
    if (error instanceof InvitationError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }

  redirect("/app");
}
