import type { ReactNode } from "react";

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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {auction.title || "Untitled Auction"}
        </h1>
        <p className="text-muted-foreground">
          Draft Auction setup. Sections autosave as you go.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]">
        <SetupNav auctionId={auction.id} />
        <div>{children}</div>
      </div>
    </div>
  );
}
