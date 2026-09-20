import { notFound } from "next/navigation";

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
      <p className="text-sm text-muted-foreground">
        This Auction uses Simple Rules. Switch to Tiered Rules on the Rules
        section to configure Tiers.
      </p>
    );
  }

  const board = await loadTiersBoardAction(id);
  if (!board) notFound();

  return (
    <TiersEditor
      assignments={board.assignments}
      auctionId={id}
      tiers={board.tiers}
    />
  );
}
