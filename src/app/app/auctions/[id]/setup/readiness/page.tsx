import { notFound } from "next/navigation";

import { requireEditableAuction } from "@/features/auctions/setup/data";
import { ReadinessView } from "@/features/auctions/setup/readiness-view";
import { syncAuctionReadiness } from "@/server/auction-command/readiness";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export default async function ReadinessSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireEditableAuction(id);
  const session = await getCurrentSession();
  if (!session) notFound();

  // Readiness is derived: opening this page records the current result, so a
  // complete Draft becomes Ready and an invalidated Ready Auction returns to
  // Draft.
  const readiness = await syncAuctionReadiness(getPool(), session.user.id, id);
  if (!readiness) notFound();

  return <ReadinessView auctionId={id} readiness={readiness} />;
}
