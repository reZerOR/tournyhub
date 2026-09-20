import type { Pool } from "pg";
import { z } from "zod";

import {
  createInvitationToken,
  digestInvitationToken,
  invitationEmailSchema,
  invitationExpiresAt,
  normalizeEmail,
} from "@/domain/invitation";
import {
  lockEditableAuction,
  markAuctionDraft,
} from "@/server/auction-command/lock-editable-auction";
import { isUniqueViolation } from "@/server/database/pg-error";

/** An invitation rule the Organizer or invitee can act on. */
export class InvitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvitationError";
  }
}

const inviteInputSchema = z.object({
  email: invitationEmailSchema,
  teamId: z.uuid(),
});

export type InviteOutsideRepresentativeInput = z.input<
  typeof inviteInputSchema
>;

export interface IssuedInvitation {
  auctionId: string;
  auctionTitle: string;
  expiresAt: Date;
  invitationId: string;
  teamId: string;
  teamName: string;
  token: string;
}

interface InvitationRow {
  accepted_at: Date | null;
  accepted_by_user_id: null | string;
  auction_id: string;
  created_at: Date;
  expires_at: Date;
  id: string;
  invited_email: string;
  status: string;
  team_id: string;
  token_digest: string;
}

/**
 * Issues a single-use Outside Representative invitation for one Team. The
 * token's digest is stored; the raw token is returned to the caller, which
 * sends it and never logs it. Issuing this invitation supersedes every older
 * pending invitation for the Team. Returns null when the Auction is not
 * editable by this Organizer.
 */
export async function createTeamInvitation(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  input: InviteOutsideRepresentativeInput,
): Promise<IssuedInvitation | null> {
  const parsed = inviteInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }

    const teamResult = await client.query<{
      name: null | string;
    }>(`select "name" from "team" where "id" = $1 and "auction_id" = $2`, [
      parsed.teamId,
      auctionId,
    ]);
    const team = teamResult.rows[0];
    if (!team) {
      await client.query("rollback");
      throw new InvitationError("That Team is not in this Auction.");
    }

    const auctionResult = await client.query<{ title: string }>(
      `select "title" from "auction" where "id" = $1`,
      [auctionId],
    );
    const timeResult = await client.query<{ now: Date }>(`select now() as now`);
    const expiresAt = invitationExpiresAt(timeResult.rows[0]!.now);
    const { digest, token } = createInvitationToken();

    await client.query(
      `update "team_invitation"
          set "status" = 'superseded'
        where "team_id" = $1 and "status" = 'pending'`,
      [parsed.teamId],
    );

    const inserted = await client.query<{ id: string }>(
      `insert into "team_invitation"
          ("auction_id", "team_id", "invited_email", "token_digest", "expires_at")
       values ($1, $2, $3, $4, $5)
       returning "id"`,
      [auctionId, parsed.teamId, parsed.email, digest, expiresAt],
    );
    const invitationId = inserted.rows[0]!.id;
    await client.query(
      `update "team_invitation"
          set "superseded_by_id" = $2
        where "team_id" = $1 and "status" = 'superseded' and "superseded_by_id" is null`,
      [parsed.teamId, invitationId],
    );

    await markAuctionDraft(client, auctionId);
    await client.query("commit");

    return {
      auctionId,
      auctionTitle: auctionResult.rows[0]!.title,
      expiresAt,
      invitationId,
      teamId: parsed.teamId,
      teamName: team.name ?? "an unnamed Team",
      token,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Marks a still-pending invitation revoked. Returns false when it was already settled. */
export async function revokeTeamInvitation(
  pool: Pool,
  invitationId: string,
): Promise<boolean> {
  const result = await pool.query(
    `update "team_invitation"
        set "status" = 'revoked'
      where "id" = $1 and "status" = 'pending'`,
    [invitationId],
  );
  return result.rowCount === 1;
}

export interface AcceptedInvitation {
  auctionId: string;
  teamId: string;
}

/**
 * Accepts an invitation for the signed-in User. The token is single-use and
 * valid only for the exact verified invited email, and it must not have
 * expired. Returns the Team the User now represents.
 */
export async function acceptTeamInvitation(
  pool: Pool,
  userId: string,
  token: string,
): Promise<AcceptedInvitation> {
  const digest = digestInvitationToken(token);
  const client = await pool.connect();
  try {
    await client.query("begin");

    const invitationResult = await client.query<InvitationRow>(
      `select * from "team_invitation" where "token_digest" = $1 for update`,
      [digest],
    );
    const invitation = invitationResult.rows[0];
    if (!invitation) {
      throw new InvitationError("This invitation link is not valid.");
    }

    const auctionResult = await client.query<{
      organizer_id: string;
      status: string;
    }>(
      `select "organizer_id", "status" from "auction" where "id" = $1 for update`,
      [invitation.auction_id],
    );
    const auction = auctionResult.rows[0];
    if (!auction) {
      throw new InvitationError("This invitation link is not valid.");
    }

    if (invitation.status === "accepted") {
      throw new InvitationError("This invitation has already been accepted.");
    }
    if (invitation.status !== "pending") {
      throw new InvitationError(
        "This invitation is no longer valid. Ask the Organizer to send a new one.",
      );
    }

    const expired = await client.query<{ expired: boolean }>(
      `select "expires_at" <= now() as expired from "team_invitation" where "id" = $1`,
      [invitation.id],
    );
    if (expired.rows[0]!.expired) {
      throw new InvitationError(
        "This invitation has expired. Ask the Organizer to send a new one.",
      );
    }

    if (auction.status !== "draft" && auction.status !== "ready") {
      throw new InvitationError(
        "This Auction is no longer accepting new representatives.",
      );
    }

    const userResult = await client.query<{
      email: string;
      email_verified: boolean;
    }>(
      `select "email", "emailVerified" as email_verified from "user" where "id" = $1`,
      [userId],
    );
    const user = userResult.rows[0];
    if (!user || !user.email_verified) {
      throw new InvitationError("Verify your email before accepting.");
    }
    if (normalizeEmail(user.email) !== invitation.invited_email) {
      throw new InvitationError(
        "This invitation was sent to a different email address.",
      );
    }
    if (userId === auction.organizer_id) {
      throw new InvitationError(
        "The Organizer cannot represent a Team in their own Auction.",
      );
    }

    const conflict = await client.query(
      `select 1 from "team"
        where "auction_id" = $1 and "representative_user_id" = $2 and "id" <> $3`,
      [invitation.auction_id, userId, invitation.team_id],
    );
    if (conflict.rowCount && conflict.rowCount > 0) {
      throw new InvitationError(
        "You already represent another Team in this Auction.",
      );
    }

    await client.query(
      `update "player_entry"
          set "is_representative" = false, "team_id" = null, "updated_at" = now()
        where "team_id" = $1`,
      [invitation.team_id],
    );
    await client.query(
      `update "team"
          set "representative_user_id" = $2,
              "representative_type" = 'outside',
              "updated_at" = now()
        where "id" = $1 and "auction_id" = $3`,
      [invitation.team_id, userId, invitation.auction_id],
    );
    await client.query(
      `update "team_invitation"
          set "status" = 'superseded'
        where "team_id" = $1 and "status" = 'pending' and "id" <> $2`,
      [invitation.team_id, invitation.id],
    );
    await client.query(
      `update "team_invitation"
          set "status" = 'accepted', "accepted_at" = now(), "accepted_by_user_id" = $2
        where "id" = $1`,
      [invitation.id, userId],
    );
    await markAuctionDraft(client, invitation.auction_id);
    await client.query("commit");

    return { auctionId: invitation.auction_id, teamId: invitation.team_id };
  } catch (error) {
    await client.query("rollback");
    if (isUniqueViolation(error)) {
      throw new InvitationError(
        "You already represent another Team in this Auction.",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}
