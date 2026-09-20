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
    <div className="flex flex-col items-center gap-6">
      <NewAuctionForm />
      <CopyAuctionForm sources={sources} />
    </div>
  );
}
