import type { Team } from "@/domain/team";
import { getTeamsForOrganizer } from "@/server/auction-query/teams";
import type { Queryable } from "@/server/database/queryable";

export interface RepresentativeView {
  invitation: null | { email: string; expiresAt: Date };
  playerEntry: null | { displayName: string; id: string };
  team: Team;
  user: null | { email: string; id: string; name: string };
}

interface UserRow {
  email: string;
  id: string;
  name: string;
}

/**
 * Every Team with its representative, its Player Representative preassignment,
 * and its live pending invitation, or null when the Auction is not editable
 * for this Organizer.
 */
export async function getRepresentativesForOrganizer(
  db: Queryable,
  organizerId: string,
  auctionId: string,
): Promise<null | RepresentativeView[]> {
  const teams = await getTeamsForOrganizer(db, organizerId, auctionId);
  if (!teams) return null;
  if (teams.length === 0) return [];

  const representativeIds = [
    ...new Set(
      teams.flatMap((team) =>
        team.representativeUserId ? [team.representativeUserId] : [],
      ),
    ),
  ];

  const userById = new Map<string, UserRow>();
  if (representativeIds.length > 0) {
    const users = await db.query<UserRow>(
      `select "id", "name", "email" from "user" where "id" = any($1::text[])`,
      [representativeIds],
    );
    for (const user of users.rows) userById.set(user.id, user);
  }

  const entries = await db.query<{
    display_name: string;
    id: string;
    team_id: string;
  }>(
    `select "id", "display_name", "team_id" from "player_entry"
      where "auction_id" = $1 and "is_representative" and "team_id" is not null`,
    [auctionId],
  );
  const entryByTeam = new Map(entries.rows.map((row) => [row.team_id, row]));

  const invitations = await db.query<{
    expires_at: Date;
    invited_email: string;
    team_id: string;
  }>(
    `select "team_id", "invited_email", "expires_at" from "team_invitation"
      where "auction_id" = $1 and "status" = 'pending' and "expires_at" > now()`,
    [auctionId],
  );
  const invitationByTeam = new Map(
    invitations.rows.map((row) => [row.team_id, row]),
  );

  return teams.map((team) => {
    const user = team.representativeUserId
      ? (userById.get(team.representativeUserId) ?? null)
      : null;
    const entry = entryByTeam.get(team.id);
    const invitation = invitationByTeam.get(team.id);

    return {
      invitation: invitation
        ? { email: invitation.invited_email, expiresAt: invitation.expires_at }
        : null,
      playerEntry: entry
        ? { displayName: entry.display_name, id: entry.id }
        : null,
      team,
      user: user ? { email: user.email, id: user.id, name: user.name } : null,
    };
  });
}
