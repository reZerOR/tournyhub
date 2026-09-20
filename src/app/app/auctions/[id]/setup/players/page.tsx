import { notFound } from "next/navigation";

import { PlayersEditor } from "@/features/auctions/setup/players-editor";
import {
  serializeCustomPlayerField,
  serializePlayerEntry,
} from "@/features/auctions/setup/serialize-player";
import {
  getCustomPlayerFieldsForOrganizer,
  getPlayerEntriesForOrganizer,
} from "@/server/auction-query/player-entries";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export default async function PlayersSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) notFound();

  const pool = getPool();
  const [customFields, entries] = await Promise.all([
    getCustomPlayerFieldsForOrganizer(pool, session.user.id, id),
    getPlayerEntriesForOrganizer(pool, session.user.id, id),
  ]);
  if (!customFields || !entries) notFound();

  return (
    <PlayersEditor
      auctionId={id}
      customFields={customFields.map(serializeCustomPlayerField)}
      entries={entries.map(serializePlayerEntry)}
    />
  );
}
