import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { invitationEmailSchema } from "@/domain/invitation";
import type { Team } from "@/domain/team";
import {
  lockEditableAuction,
  markAuctionDraft,
} from "@/server/auction-command/lock-editable-auction";
import {
  loadTeamRow,
  mapTeamRow,
  type TeamRow,
} from "@/server/auction-query/teams";

/** A representative rule the Organizer can repair, as opposed to an unexpected failure. */
export class RepresentativeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepresentativeError";
  }
}

const assignInputSchema = z.object({
  email: invitationEmailSchema,
  playerEntryId: z.uuid(),
  teamId: z.uuid(),
});

export type AssignPlayerRepresentativeInput = z.input<typeof assignInputSchema>;

/** Clears any Player Representative preassigned to a Team. */
async function clearPlayerRepresentative(
  client: PoolClient,
  teamId: string,
): Promise<void> {
  await client.query(
    `update "player_entry"
        set "is_representative" = false, "team_id" = null, "updated_at" = now()
      where "team_id" = $1`,
    [teamId],
  );
}

/** Supersedes every pending Outside Representative invitation for a Team. */
async function supersedePendingInvitations(
  client: PoolClient,
  teamId: string,
): Promise<void> {
  await client.query(
    `update "team_invitation"
        set "status" = 'superseded'
      where "team_id" = $1 and "status" = 'pending'`,
    [teamId],
  );
}

/**
 * Links a registered User and a Player Entry as one Team's Player
 * Representative. The Player Entry is preassigned to that Team and never
 * enters the bidding queue. Returns null when the Auction is not editable by
 * this Organizer.
 */
export async function assignPlayerRepresentative(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  input: AssignPlayerRepresentativeInput,
): Promise<null | Team> {
  const parsed = assignInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }

    const team = await loadTeamRow(client, auctionId, parsed.teamId);
    if (!team) {
      await client.query("rollback");
      throw new RepresentativeError("That Team is not in this Auction.");
    }

    const entry = await client.query<{ team_id: null | string }>(
      `select "team_id" from "player_entry" where "id" = $1 and "auction_id" = $2`,
      [parsed.playerEntryId, auctionId],
    );
    if (!entry.rowCount) {
      await client.query("rollback");
      throw new RepresentativeError(
        "That Player Entry is not in this Auction.",
      );
    }
    if (
      entry.rows[0]!.team_id !== null &&
      entry.rows[0]!.team_id !== parsed.teamId
    ) {
      await client.query("rollback");
      throw new RepresentativeError(
        "That Player Entry already represents another Team.",
      );
    }

    const user = await client.query<{ email_verified: boolean; id: string }>(
      `select "id", "emailVerified" as email_verified from "user" where "email" = $1`,
      [parsed.email],
    );
    const representative = user.rows[0];
    if (!representative || !representative.email_verified) {
      await client.query("rollback");
      throw new RepresentativeError(
        "That email does not belong to a registered, verified User.",
      );
    }
    if (representative.id === organizerId) {
      await client.query("rollback");
      throw new RepresentativeError(
        "The Organizer cannot represent a Team in their own Auction.",
      );
    }

    const conflict = await client.query(
      `select 1 from "team"
        where "auction_id" = $1 and "representative_user_id" = $2 and "id" <> $3`,
      [auctionId, representative.id, parsed.teamId],
    );
    if (conflict.rowCount && conflict.rowCount > 0) {
      await client.query("rollback");
      throw new RepresentativeError(
        "That User already represents another Team in this Auction.",
      );
    }

    await clearPlayerRepresentative(client, parsed.teamId);
    await client.query(
      `update "player_entry"
          set "is_representative" = true, "team_id" = $2, "updated_at" = now()
        where "id" = $1 and "auction_id" = $3`,
      [parsed.playerEntryId, parsed.teamId, auctionId],
    );
    await supersedePendingInvitations(client, parsed.teamId);
    const updated = await client.query<TeamRow>(
      `update "team"
          set "representative_user_id" = $3,
              "representative_type" = 'player',
              "updated_at" = now()
        where "id" = $1 and "auction_id" = $2
        returning *`,
      [parsed.teamId, auctionId, representative.id],
    );
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return mapTeamRow(updated.rows[0]!);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Removes a Team's representative and its Player Representative preassignment. Returns false when it is not editable by this Organizer. */
export async function removeRepresentative(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  teamId: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return false;
    }
    if (!(await loadTeamRow(client, auctionId, teamId))) {
      await client.query("rollback");
      return false;
    }

    await clearPlayerRepresentative(client, teamId);
    await client.query(
      `update "team"
          set "representative_user_id" = null,
              "representative_type" = null,
              "updated_at" = now()
        where "id" = $1 and "auction_id" = $2`,
      [teamId, auctionId],
    );
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
