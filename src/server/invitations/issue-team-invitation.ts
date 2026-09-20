import type { Pool } from "pg";

import { serverEnv } from "@/config/server-env";
import { invitationHref, normalizeEmail } from "@/domain/invitation";
import {
  createTeamInvitation,
  InvitationError,
  revokeTeamInvitation,
  type IssuedInvitation,
} from "@/server/auction-command/team-invitations";
import type { EmailSender } from "@/server/email/types";

export interface IssueTeamInvitationInput {
  auctionId: string;
  email: string;
  organizerId: string;
  teamId: string;
}

/**
 * Issues an Outside Representative invitation and emails its link. Delivery
 * sits outside the Auction Command module: the command stores the digest, and
 * this composes that with the `EmailSender` seam. If delivery fails the
 * pending invitation is revoked, so a failure leaves no usable token behind.
 */
export async function issueTeamInvitation({
  emailSender,
  input,
  pool,
}: {
  emailSender: EmailSender;
  input: IssueTeamInvitationInput;
  pool: Pool;
}): Promise<IssuedInvitation | null> {
  const issued = await createTeamInvitation(
    pool,
    input.organizerId,
    input.auctionId,
    { email: input.email, teamId: input.teamId },
  );
  if (!issued) return null;

  const link = new URL(
    invitationHref(issued.token),
    serverEnv.NEXT_PUBLIC_APP_URL,
  ).toString();

  try {
    await emailSender.sendInvitationEmail({
      auctionTitle: issued.auctionTitle,
      link,
      teamName: issued.teamName,
      to: normalizeEmail(input.email),
    });
  } catch {
    await revokeTeamInvitation(pool, issued.invitationId);
    throw new InvitationError(
      "The invitation email could not be sent. Try again.",
    );
  }

  return issued;
}
