import { digestInvitationToken } from "@/domain/invitation";
import type { Queryable } from "@/server/database/queryable";

export interface InvitationView {
  auctionId: string;
  auctionTitle: string;
  /** Whether the invitation had expired as of this read, using database time. */
  expired: boolean;
  expiresAt: Date;
  invitedEmail: string;
  status: string;
  teamId: string;
  teamName: null | string;
}

interface InvitationViewRow {
  auction_id: string;
  auction_title: string;
  expired: boolean;
  expires_at: Date;
  invited_email: string;
  status: string;
  team_id: string;
  team_name: null | string;
}

/**
 * Looks up an invitation by its raw token. Only the token holder learns the
 * Team and Auction it names; the digest is what is stored.
 */
export async function getInvitationForToken(
  db: Queryable,
  token: string,
): Promise<InvitationView | null> {
  const result = await db.query<InvitationViewRow>(
    `select ti."auction_id",
            ti."team_id",
            ti."invited_email",
            ti."status",
            ti."expires_at",
            ti."expires_at" <= now() as expired,
            a."title" as auction_title,
            t."name" as team_name
       from "team_invitation" ti
       join "auction" a on a."id" = ti."auction_id"
       join "team" t on t."id" = ti."team_id"
      where ti."token_digest" = $1 and a."hidden_at" is null`,
    [digestInvitationToken(token)],
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    auctionId: row.auction_id,
    auctionTitle: row.auction_title,
    expired: row.expired,
    expiresAt: row.expires_at,
    invitedEmail: row.invited_email,
    status: row.status,
    teamId: row.team_id,
    teamName: row.team_name,
  };
}
