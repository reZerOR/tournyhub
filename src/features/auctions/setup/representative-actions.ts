"use server";

import { z } from "zod";

import { InvitationError } from "@/server/auction-command/team-invitations";
import {
  assignPlayerRepresentative,
  removeRepresentative,
  RepresentativeError,
} from "@/server/auction-command/representatives";
import { getRepresentativesForOrganizer } from "@/server/auction-query/representatives";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";
import { createDefaultEmailSender } from "@/server/email/create-email-sender";
import { issueTeamInvitation } from "@/server/invitations/issue-team-invitation";
import {
  serializeRepresentativeView,
  type SerializedRepresentativeView,
} from "@/features/auctions/setup/serialize-team";

const NOT_EDITABLE = "This Auction is no longer available to edit.";

export type RepresentativeResult =
  | { representatives: SerializedRepresentativeView[]; status: "saved" }
  | { message: string; status: "error" };

export type InvitationResult =
  { email: string; status: "invited" } | { message: string; status: "error" };

function toError(error: unknown): { message: string; status: "error" } {
  if (error instanceof z.ZodError) {
    return {
      message: error.issues[0]?.message ?? "Enter valid representative data.",
      status: "error",
    };
  }
  if (
    error instanceof RepresentativeError ||
    error instanceof InvitationError
  ) {
    return { message: error.message, status: "error" };
  }
  throw error;
}

async function reload(
  auctionId: string,
  userId: string,
): Promise<null | SerializedRepresentativeView[]> {
  const views = await getRepresentativesForOrganizer(
    getPool(),
    userId,
    auctionId,
  );
  if (!views) return null;
  return views.map((view) => serializeRepresentativeView(view, auctionId));
}

export async function loadRepresentativesAction(
  auctionId: string,
): Promise<null | SerializedRepresentativeView[]> {
  const session = await getCurrentSession();
  if (!session) return null;
  return reload(auctionId, session.user.id);
}

export async function assignPlayerRepresentativeAction(
  auctionId: string,
  input: { email: string; playerEntryId: string; teamId: string },
): Promise<RepresentativeResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  try {
    const team = await assignPlayerRepresentative(
      getPool(),
      session.user.id,
      auctionId,
      input,
    );
    if (!team) return { message: NOT_EDITABLE, status: "error" };
    const representatives = await reload(auctionId, session.user.id);
    if (!representatives) return { message: NOT_EDITABLE, status: "error" };
    return { representatives, status: "saved" };
  } catch (error) {
    return toError(error);
  }
}

export async function removeRepresentativeAction(
  auctionId: string,
  teamId: string,
): Promise<RepresentativeResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  const removed = await removeRepresentative(
    getPool(),
    session.user.id,
    auctionId,
    teamId,
  );
  if (!removed) return { message: NOT_EDITABLE, status: "error" };
  const representatives = await reload(auctionId, session.user.id);
  if (!representatives) return { message: NOT_EDITABLE, status: "error" };
  return { representatives, status: "saved" };
}

export async function inviteRepresentativeAction(
  auctionId: string,
  input: { email: string; teamId: string },
): Promise<InvitationResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  try {
    const issued = await issueTeamInvitation({
      emailSender: createDefaultEmailSender(),
      input: {
        auctionId,
        email: input.email,
        organizerId: session.user.id,
        teamId: input.teamId,
      },
      pool: getPool(),
    });
    if (!issued) return { message: NOT_EDITABLE, status: "error" };
    return { email: input.email.trim().toLowerCase(), status: "invited" };
  } catch (error) {
    return toError(error);
  }
}
