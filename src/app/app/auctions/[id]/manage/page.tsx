import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { ArchiveAuctionButton } from "@/features/auctions/lifecycle/archive-auction-button";
import { ManageConsole } from "@/features/auctions/manage/manage-console";
import { getAuctionManagementForOrganizer } from "@/server/auction-query/manage";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export default async function ManageAuctionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");

  const management = await getAuctionManagementForOrganizer(
    getPool(),
    session.user.id,
    id,
  );
  if (!management) notFound();

  const statusLabel =
    management.status === "paused"
      ? "Paused"
      : management.status === "ready"
        ? "Ready"
        : "Draft";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Manage Auction
          </h1>
          <p className="text-muted-foreground">
            {statusLabel} · Revision {management.revision} · Controlled changes
            are recorded in the Audit History.
          </p>
        </div>
        <Link className={buttonVariants({ variant: "outline" })} href="/app">
          Dashboard
        </Link>
      </div>

      <ManageConsole auctionId={id} management={management} />

      {(management.status === "draft" || management.status === "ready") && (
        <ArchiveAuctionButton auctionId={id} />
      )}
    </div>
  );
}
