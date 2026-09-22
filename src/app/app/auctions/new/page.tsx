import { redirect } from "next/navigation";

import { CopyAuctionForm } from "@/features/auctions/lifecycle/copy-auction-form";
import { NewAuctionForm } from "@/features/auctions/setup/new-auction-form";
import { getCopySourcesForOrganizer } from "@/server/auction-query/lifecycle";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export default async function NewAuctionPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");

  const sources = await getCopySourcesForOrganizer(getPool(), session.user.id);

  return (
    <div className="setup-console mx-auto flex w-full max-w-3xl flex-col gap-5">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">
        New Auction
      </h1>

      <NewAuctionForm />
      <CopyAuctionForm sources={sources} />
    </div>
  );
}
