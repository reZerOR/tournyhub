import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminAuctionRowView } from "@/features/administration/admin-auction-row";
import { AdminUserRowView } from "@/features/administration/admin-user-row";
import {
  isPlatformAdministrator,
  listAuctionsForAdministrator,
  listUsersForAdministrator,
} from "@/server/auction-query/administration";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export default async function AdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");

  const pool = getPool();
  // Administrator status is read from the allowlisted database role, so an
  // ordinary registration cannot reach this page.
  if (!(await isPlatformAdministrator(pool, session.user.id))) notFound();

  const { q } = await searchParams;
  const query = q ?? "";
  const [users, auctions] = await Promise.all([
    listUsersForAdministrator(pool, query),
    listAuctionsForAdministrator(pool, query),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Platform Administration
          </h1>
          <p className="text-muted-foreground">
            Suspend Users, revoke sessions, and hide Auctions. Every action
            needs a reason and is recorded permanently.
          </p>
        </div>
        <Link className={buttonVariants({ variant: "outline" })} href="/app">
          Dashboard
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Search Users and Auctions
          <Input defaultValue={query} name="q" />
        </label>
        <button
          className={buttonVariants({ variant: "secondary" })}
          type="submit"
        >
          Search
        </button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Users
          </CardTitle>
          <CardDescription>
            Suspending a User also revokes every active session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Users matched.</p>
          ) : (
            <ul className="flex flex-col">
              {users.map((user) => (
                <AdminUserRowView key={user.id} user={user} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Auctions
          </CardTitle>
          <CardDescription>
            Hiding an Auction keeps its records and makes it unavailable to its
            participants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auctions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Auctions matched.
            </p>
          ) : (
            <ul className="flex flex-col">
              {auctions.map((auction) => (
                <AdminAuctionRowView auction={auction} key={auction.id} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
