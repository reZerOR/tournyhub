import { notFound } from "next/navigation";

import { RepresentativesEditor } from "@/features/auctions/setup/representatives-editor";
import { serializePlayerEntry } from "@/features/auctions/setup/serialize-player";
import {
  serializeRepresentativeView,
  serializeTeam,
} from "@/features/auctions/setup/serialize-team";
import { getPlayerEntriesForOrganizer } from "@/server/auction-query/player-entries";
import { getRepresentativesForOrganizer } from "@/server/auction-query/representatives";
import { getTeamsForOrganizer } from "@/server/auction-query/teams";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export default async function RepresentativesSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) notFound();

  const pool = getPool();
  const [teams, entries, representatives] = await Promise.all([
    getTeamsForOrganizer(pool, session.user.id, id),
    getPlayerEntriesForOrganizer(pool, session.user.id, id),
    getRepresentativesForOrganizer(pool, session.user.id, id),
  ]);
  if (!teams || !entries || !representatives) notFound();

  return (
    <RepresentativesEditor
      auctionId={id}
      entries={entries.map(serializePlayerEntry)}
      representatives={representatives.map((view) =>
        serializeRepresentativeView(view, id),
      )}
      teams={teams.map((team) => serializeTeam(team, id))}
    />
  );
}
