import Link from "next/link";
import type { ReactNode } from "react";

import { Stat, StatStrip } from "@/components/arena";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireEditableAuction } from "@/features/auctions/setup/data";
import { GateBar } from "@/features/auctions/setup/gate-bar";
import { SetupNav } from "@/features/auctions/setup/setup-nav";
import { buildSetupStations } from "@/features/auctions/setup/setup-stations";
import { getReadinessForOrganizer } from "@/server/auction-query/readiness";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

/**
 * The Setup console. One identity band names the Draft, one station rail maps
 * the work, and one command bar carries the launch gate, so an Organizer can
 * always see where the Auction stands and what still stands in its way.
 */
export default async function AuctionSetupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auction = await requireEditableAuction(id);

  const session = await getCurrentSession();
  const report = session
    ? await getReadinessForOrganizer(getPool(), session.user.id, id)
    : null;
  const readiness = report?.readiness ?? null;

  const stations = buildSetupStations({
    auctionId: auction.id,
    readiness,
    rulesMode: auction.rulesMode,
  });

  const rulesLabel =
    auction.rulesMode === "tiered" ? "Tiered Rules" : "Simple Rules";
  const closeLabel =
    auction.closeMode === "timed" ? "Timed Close" : "Manual Close";

  return (
    <div className="setup-console mx-auto flex w-full max-w-[76rem] flex-col gap-5">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">
              {auction.title || "Untitled Auction"}
            </h1>
            <Badge variant={auction.status === "ready" ? "roster" : "outline"}>
              {auction.status === "ready" ? "Ready" : "Draft"}
            </Badge>
          </div>
          <StatStrip>
            <Stat label="Game" value={auction.game || "—"} />
            <Stat label="Rules" value={rulesLabel} />
            <Stat label="Close" value={closeLabel} />
          </StatStrip>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 sm:self-center">
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={`/app/auctions/${auction.id}/manage`}
          >
            Manage Auction
          </Link>
          <GateBar
            auctionId={auction.id}
            openRequirements={readiness?.errors.length ?? 0}
            ready={readiness?.ready ?? false}
            warnings={readiness?.warnings.length ?? 0}
          />
        </div>
      </header>

      <div className="flex flex-col gap-6">
        <SetupNav stations={stations} />

        <div className="flex min-h-[calc(100svh-14rem)] min-w-0 flex-col gap-5">
          {children}
        </div>
      </div>
    </div>
  );
}

