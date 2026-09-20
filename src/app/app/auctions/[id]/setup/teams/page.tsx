import { notFound } from "next/navigation";

import { TeamsEditor } from "@/features/auctions/setup/teams-editor";
import { serializeTeam } from "@/features/auctions/setup/serialize-team";
import { getTeamsForOrganizer } from "@/server/auction-query/teams";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export default async function TeamsSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) notFound();

  const teams = await getTeamsForOrganizer(getPool(), session.user.id, id);
  if (!teams) notFound();

  return (
    <TeamsEditor
      auctionId={id}
      teams={teams.map((team) => serializeTeam(team, id))}
    />
  );
}
