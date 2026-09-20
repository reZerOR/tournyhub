import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Auction } from "@/domain/auction";
import {
  getArchivedAuctions,
  getOrganizerAuctions,
} from "@/server/auction-query/auction-query";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

function AuctionRow({ auction }: { auction: Auction }) {
  return (
    <Link
      className="flex items-center justify-between gap-4 py-4 hover:bg-muted/50"
      href={`/app/auctions/${auction.id}/setup/basics`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium">
          {auction.title || "Untitled Auction"}
        </span>
        <span className="text-sm text-muted-foreground">
          {auction.game || "No Game set"}
        </span>
      </div>
      <Badge className="capitalize" variant="secondary">
        {auction.status}
      </Badge>
    </Link>
  );
}

function AuctionList({ auctions }: { auctions: Auction[] }) {
  return (
    <div className="flex flex-col">
      {auctions.map((auction, index) => (
        <div key={auction.id}>
          {index > 0 && <Separator />}
          <AuctionRow auction={auction} />
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");

  const pool = getPool();
  const [organizedAuctions, archivedAuctions] = await Promise.all([
    getOrganizerAuctions(pool, session.user.id),
    getArchivedAuctions(pool, session.user.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Your Auctions, Teams, and invitations.
          </p>
        </div>
        <Link href="/app/auctions/new" className={buttonVariants()}>
          New Auction
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Auctions you organize
          </CardTitle>
          <CardDescription>
            Draft, Ready, Live, Paused, Completed, and Cancelled Auctions you
            created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {organizedAuctions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven&apos;t created an Auction yet.
            </p>
          ) : (
            <AuctionList auctions={organizedAuctions} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Teams you represent
          </CardTitle>
          <CardDescription>
            Auctions where you operate a Team&apos;s bidding controls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You don&apos;t represent any Teams yet.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Pending invitations
          </CardTitle>
          <CardDescription>
            Team invitations waiting for your response.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You have no pending invitations.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Archived Auctions
          </CardTitle>
          <CardDescription>
            Hidden Auctions retained for seven days before permanent deletion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {archivedAuctions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have no Archived Auctions.
            </p>
          ) : (
            <AuctionList auctions={archivedAuctions} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
