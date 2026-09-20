import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { ModerationInspect } from "@/features/administration/moderation-inspect";
import { isPlatformAdministrator } from "@/server/auction-query/administration";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export default async function ModerateAuctionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");

  if (!(await isPlatformAdministrator(getPool(), session.user.id))) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Moderate Auction
        </h1>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href="/app/admin"
        >
          Administration
        </Link>
      </div>

      <ModerationInspect auctionId={id} />
    </div>
  );
}
