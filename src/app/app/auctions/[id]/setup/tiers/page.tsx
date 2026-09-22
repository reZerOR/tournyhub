import Link from "next/link";
import { notFound } from "next/navigation";

import { StationPlate } from "@/components/arena";
import { requireEditableAuction } from "@/features/auctions/setup/data";
import { loadTiersBoardAction } from "@/features/auctions/setup/tier-actions";
import { TiersEditor } from "@/features/auctions/setup/tiers-editor";
import { getCurrentSession } from "@/server/auth/session";

export default async function TiersSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auction = await requireEditableAuction(id);
  const session = await getCurrentSession();
  if (!session) notFound();

  if (auction.rulesMode !== "tiered") {
    return (
      <StationPlate label="Tiers">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span>This Auction uses Simple Rules.</span>
          <Link
            className="font-mono text-xs text-neon underline-offset-4 hover:underline"
            href={`/app/auctions/${id}/setup/rules`}
          >
            switch to Tiered Rules
          </Link>
        </p>
      </StationPlate>
    );
  }

  const board = await loadTiersBoardAction(id);
  if (!board) notFound();

  return (
    <TiersEditor
      assignments={board.assignments}
      auctionId={id}
      teamCount={board.teamCount}
      tiers={board.tiers}
    />
  );
}
