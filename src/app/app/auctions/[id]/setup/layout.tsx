import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { requireEditableAuction } from "@/features/auctions/setup/data";
import { SetupNav } from "@/features/auctions/setup/setup-nav";

export default async function AuctionSetupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auction = await requireEditableAuction(id);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {auction.title || "Untitled Auction"}
          </h1>
          <p className="text-muted-foreground">
            Draft Auction setup. Sections autosave as you go.
          </p>
        </div>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={`/app/auctions/${auction.id}/manage`}
        >
          Manage Auction
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]">
        <SetupNav auctionId={auction.id} rulesMode={auction.rulesMode} />
        <div>{children}</div>
      </div>
    </div>
  );
}
