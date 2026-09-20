import { notFound } from "next/navigation";

import { LiveConsole } from "@/features/auctions/live/live-console";
import { getLiveSnapshot } from "@/server/auction-query/live-snapshot";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export default async function LiveAuctionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) notFound();

  // An unrelated User, a former Representative, and a non-Live Auction all
  // look identical here.
  const access = await getLiveSnapshot(getPool(), session.user.id, id);
  if (!access) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <LiveConsole
        auctionId={id}
        initialSnapshot={access.snapshot}
        initialSoundEnabled={session.user.soundEnabled === true}
        role={access.role}
      />
    </div>
  );
}
