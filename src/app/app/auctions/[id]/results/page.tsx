import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { ArchiveAuctionButton } from "@/features/auctions/lifecycle/archive-auction-button";
import { ResultsView } from "@/features/auctions/results/results-view";
import { getResultsForCaller } from "@/server/auction-query/results";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export default async function AuctionResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");

  // An unrelated User, a former Representative, and an Auction without Results
  // all look identical here.
  const view = await getResultsForCaller(getPool(), session.user.id, id);
  if (!view) notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {view.title || "Untitled Auction"}
        </h1>
        <Link className={buttonVariants({ variant: "outline" })} href="/app">
          Dashboard
        </Link>
      </div>

      <ResultsView auctionId={id} view={view} />

      {view.viewerRole === "organizer" &&
        (view.status === "completed" || view.status === "cancelled") && (
          <ArchiveAuctionButton auctionId={id} />
        )}
    </div>
  );
}
