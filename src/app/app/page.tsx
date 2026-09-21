import {
  Archive,
  ArrowRight,
  Gavel,
  Inbox,
  Plus,
  Trophy,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Auction } from "@/domain/auction";
import { RestoreAuctionButton } from "@/features/auctions/lifecycle/restore-auction-button";
import { purgeExpiredArchivedAuctions } from "@/server/auction-command/archive";
import {
  getOrganizerAuctions,
  getRepresentedAuctions,
} from "@/server/auction-query/auction-query";
import {
  getArchivedAuctionViewsForOrganizer,
  type ArchivedAuctionView,
} from "@/server/auction-query/lifecycle";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

type StatusBadgeVariant =
  | "default"
  | "destructive"
  | "neon"
  | "outline"
  | "secondary"
  | "success"
  | "warning";

function auctionHref(auction: Auction): string {
  if (auction.status === "live" || auction.status === "paused") {
    return `/app/auctions/${auction.id}/live`;
  }
  if (
    auction.status === "completed" ||
    auction.status === "cancelled" ||
    auction.status === "archived"
  ) {
    return `/app/auctions/${auction.id}/results`;
  }
  return `/app/auctions/${auction.id}/setup/basics`;
}

function auctionAction(auction: Auction): string {
  if (auction.status === "live" || auction.status === "paused") return "Open";
  if (auction.status === "draft") return "Continue";
  if (auction.status === "ready") return "Manage";
  return "View";
}

function badgeVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case "live":
      return "neon";
    case "ready":
      return "default";
    case "paused":
      return "warning";
    case "completed":
      return "success";
    case "cancelled":
      return "destructive";
    case "archived":
      return "outline";
    default:
      return "secondary";
  }
}

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function greetingName(name: string, email: string): string | null {
  const value = name.trim();
  if (!value || value === email || value.includes("@") || value.length > 24) {
    return null;
  }
  return value.split(/\s+/)[0];
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className="capitalize" variant={badgeVariant(status)}>
      {formatStatus(status)}
    </Badge>
  );
}

function DashboardSection({
  children,
  count,
  description,
  icon: Icon,
  id,
  title,
}: {
  children: ReactNode;
  count: number;
  description: string;
  icon: LucideIcon;
  id: string;
  title: string;
}) {
  return (
    <Card
      className="dashboard-panel scroll-mt-20 [--card-spacing:--spacing(5)]"
      id={id}
    >
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon aria-hidden className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <CardTitle aria-level={2} role="heading">
              {title}
            </CardTitle>
            <CardDescription className="text-pretty">
              {description}
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <Badge variant="secondary">{count}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function AuctionEmptyState({
  action,
  description,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Empty className="min-h-44 bg-background/35 py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

function AuctionTable({
  auctions,
  caption,
}: {
  auctions: Auction[];
  caption: string;
}) {
  return (
    <div className="-mx-(--card-spacing) -mb-(--card-spacing)">
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader className="bg-muted/45">
          <TableRow>
            <TableHead className="pl-(--card-spacing)" scope="col">
              Auction
            </TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col">Updated</TableHead>
            <TableHead className="pr-(--card-spacing) text-right" scope="col">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {auctions.map((auction) => {
            const href = auctionHref(auction);
            const action = auctionAction(auction);

            return (
              <TableRow key={auction.id}>
                <TableCell className="pl-(--card-spacing)">
                  <Link
                    className="group/link flex max-w-96 flex-col gap-0.5 whitespace-normal"
                    href={href}
                  >
                    <span className="font-medium group-hover/link:text-primary">
                      {auction.title || "Untitled Auction"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {auction.game || "No Game set"}
                    </span>
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={auction.status} />
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  <time dateTime={auction.updatedAt.toISOString()}>
                    {formatDate(auction.updatedAt)}
                  </time>
                </TableCell>
                <TableCell className="pr-(--card-spacing) text-right">
                  <Link
                    aria-label={`${action} ${auction.title || "Untitled Auction"}`}
                    className={buttonVariants({
                      size: "sm",
                      variant:
                        auction.status === "live" ? "default" : "outline",
                    })}
                    href={href}
                  >
                    {action}
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ArchivedAuctionTable({
  archivedAuctions,
}: {
  archivedAuctions: ArchivedAuctionView[];
}) {
  return (
    <div className="-mx-(--card-spacing) -mb-(--card-spacing)">
      <Table>
        <TableCaption className="sr-only">
          Archived Auctions that can still be restored
        </TableCaption>
        <TableHeader className="bg-muted/45">
          <TableRow>
            <TableHead className="pl-(--card-spacing)" scope="col">
              Auction
            </TableHead>
            <TableHead scope="col">Previous status</TableHead>
            <TableHead scope="col">Recovery window</TableHead>
            <TableHead className="pr-(--card-spacing) text-right" scope="col">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {archivedAuctions.map((view) => (
            <TableRow key={view.auction.id}>
              <TableCell className="pl-(--card-spacing)">
                <span className="font-medium">
                  {view.auction.title || "Untitled Auction"}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {view.auction.game || "No Game set"}
                </span>
              </TableCell>
              <TableCell>
                <StatusBadge status={view.previousStatus} />
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                recoverable until{" "}
                <time dateTime={view.archiveDeadline.toISOString()}>
                  {formatDate(view.archiveDeadline)}
                </time>
              </TableCell>
              <TableCell className="pr-(--card-spacing) text-right">
                <RestoreAuctionButton
                  auctionId={view.auction.id}
                  label={`Restore ${view.auction.title}`}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");

  const pool = getPool();
  // Opportunistic retention: an Archived Auction whose seven-day recovery
  // window has closed is permanently deleted the next time this dashboard
  // loads. Nothing reminds the Organizer, matching the first version's simple
  // retention rule, and an Auction restored in time is never touched.
  await purgeExpiredArchivedAuctions(pool);

  const [organizedAuctions, representedAuctions, archivedAuctions] =
    await Promise.all([
      getOrganizerAuctions(pool, session.user.id),
      getRepresentedAuctions(pool, session.user.id),
      getArchivedAuctionViewsForOrganizer(pool, session.user.id),
    ]);
  const displayName = greetingName(session.user.name, session.user.email);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Your Auctions, Teams, invitations, and archive.
        </p>
      </div>

      <Card className="dashboard-hero border-0 text-spotlight-foreground shadow-2xl ring-1 ring-white/10 [--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle
            aria-level={2}
            className="max-w-2xl text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl"
            role="heading"
          >
            {displayName ? `Welcome back, ${displayName}!` : "Welcome back!"}
          </CardTitle>
          <CardDescription className="max-w-2xl text-pretty text-spotlight-foreground/70 sm:text-base">
            Manage the Auctions you organize, open a Team&apos;s bidding
            console, and respond to invitations from one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link
            className={buttonVariants({ size: "lg", variant: "neon" })}
            href="/app/auctions/new"
          >
            <Plus aria-hidden className="size-4" />
            New Auction
          </Link>
          <Link
            className={buttonVariants({ size: "lg", variant: "outline-neon" })}
            href="/app/account"
          >
            Account settings
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </CardContent>
      </Card>

      <DashboardSection
        count={organizedAuctions.length}
        description="Manage your Auctions from Draft through completion."
        icon={Trophy}
        id="organized-auctions"
        title="Auctions you organize"
      >
        {organizedAuctions.length === 0 ? (
          <AuctionEmptyState
            action={
              <Link
                className={buttonVariants({ size: "sm" })}
                href="/app/auctions/new"
              >
                Create your first Auction
              </Link>
            }
            description="Start with the basics, then add Players, Teams, and rules."
            icon={Gavel}
            title="You haven't created an Auction yet."
          />
        ) : (
          <AuctionTable
            auctions={organizedAuctions}
            caption="Auctions you organize"
          />
        )}
      </DashboardSection>

      <DashboardSection
        count={representedAuctions.length}
        description="Auctions where you operate a Team's bidding controls."
        icon={UsersRound}
        id="represented-auctions"
        title="Teams you represent"
      >
        {representedAuctions.length === 0 ? (
          <AuctionEmptyState
            description="An Organizer can invite you to represent a Team."
            icon={UsersRound}
            title="You don't represent any Teams yet."
          />
        ) : (
          <AuctionTable
            auctions={representedAuctions}
            caption="Auctions where you represent a Team"
          />
        )}
      </DashboardSection>

      <DashboardSection
        count={0}
        description="Team invitations waiting for your response."
        icon={Inbox}
        id="invitations"
        title="Pending invitations"
      >
        <AuctionEmptyState
          description="New invitations will appear here when an Organizer invites you."
          icon={Inbox}
          title="You have no pending invitations."
        />
      </DashboardSection>

      <DashboardSection
        count={archivedAuctions.length}
        description="Hidden Auctions kept for seven days before permanent deletion."
        icon={Archive}
        id="archived-auctions"
        title="Archived Auctions"
      >
        {archivedAuctions.length === 0 ? (
          <AuctionEmptyState
            description="Archived Auctions remain recoverable here for seven days."
            icon={Archive}
            title="You have no Archived Auctions."
          />
        ) : (
          <ArchivedAuctionTable archivedAuctions={archivedAuctions} />
        )}
      </DashboardSection>
    </div>
  );
}
