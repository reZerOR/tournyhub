import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HIDDEN_PHONE, type AuctionResultsView } from "@/domain/results";

const SOURCE_LABELS: Record<string, string> = {
  bid: "Bid",
  forced: "Forced Assignment",
  representative: "Player Representative",
};

function LifecycleBadge({ status }: { status: string }) {
  return (
    <Badge className="capitalize" variant="secondary">
      {status}
    </Badge>
  );
}

function TeamResults({ view }: { view: AuctionResultsView }) {
  return (
    <div className="flex flex-col gap-4">
      {view.results.teams.map((team) => (
        <Card key={team.id}>
          <CardHeader>
            <CardTitle aria-level={3} role="heading">
              {team.name ?? "Unnamed Team"}
            </CardTitle>
            <CardDescription className="tabular-nums">
              Roster {team.rosterCount} · Spent {team.spentCredits} · Remaining{" "}
              {team.remainingBudget}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Object.keys(team.tierCounts).length > 0 && (
              <p className="text-sm text-muted-foreground">
                Tier counts:{" "}
                {Object.entries(team.tierCounts)
                  .map(
                    ([key, count]) =>
                      `${key === "unassigned" ? "Unassigned" : key} ${count}`,
                  )
                  .join(" · ")}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  {team.name ?? "Unnamed Team"} Roster
                </caption>
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th scope="col">Player</th>
                    <th scope="col">Tier</th>
                    <th scope="col">Source</th>
                    <th scope="col">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {team.players.map((player) => (
                    <tr key={player.playerEntryId}>
                      <td>{player.displayName}</td>
                      <td>{player.tierLabel ?? "—"}</td>
                      <td>{SOURCE_LABELS[player.source] ?? player.source}</td>
                      <td className="tabular-nums">
                        {player.source === "representative"
                          ? "—"
                          : player.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PlayerDetails({ view }: { view: AuctionResultsView }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Player details
        </CardTitle>
        <CardDescription>
          Supplied phone numbers follow the Auction lifecycle: the Organizer
          always sees them, a Team Representative sees them while the Auction is
          Live or Paused, and afterwards only for that Team&apos;s own Roster. A
          PDF never contains one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/*
          Explicit details: phone numbers are never part of a default table, so
          a Reader opens this section deliberately.
        */}
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Show Player details (includes phone numbers where supplied)
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Player details including supplied phone numbers
              </caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col">Player</th>
                  <th scope="col">Team</th>
                  <th scope="col">Tier</th>
                  <th scope="col">Representative</th>
                  <th scope="col">Phone</th>
                </tr>
              </thead>
              <tbody>
                {view.contacts.map((contact) => (
                  <tr key={contact.playerEntryId}>
                    <td>{contact.displayName}</td>
                    <td>{contact.teamName ?? "—"}</td>
                    <td>{contact.tierLabel ?? "—"}</td>
                    <td>{contact.isRepresentative ? "Yes" : "No"}</td>
                    <td className="tabular-nums">
                      {contact.phoneWithheld
                        ? HIDDEN_PHONE
                        : (contact.phoneNumber ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

export function ResultsView({
  auctionId,
  view,
}: {
  auctionId: string;
  view: AuctionResultsView;
}) {
  const published = view.phase === "closed";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            {published ? "Auction Results" : "Auction in progress"}
          </CardTitle>
          <CardDescription>
            {view.title || "Untitled Auction"} · {view.rulesMode} Rules ·{" "}
            <LifecycleBadge status={view.status} />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={`/app/auctions/${auctionId}/results/export/csv`}
            prefetch={false}
          >
            Download CSV
          </Link>
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={`/app/auctions/${auctionId}/results/export/pdf`}
            prefetch={false}
          >
            Download PDF
          </Link>
          <span className="text-sm text-muted-foreground">
            {view.viewerRole === "organizer"
              ? "Your CSV includes every supplied phone number. The PDF never includes one."
              : "Your CSV includes phone numbers for your own Roster only. The PDF never includes one."}
          </span>
        </CardContent>
      </Card>

      {published ? (
        <TeamResults view={view} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Results are published when the Auction completes. The Player details
          below are available to participants while the Auction runs.
        </p>
      )}

      {published && view.results.unsold.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Unsold Players
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {view.results.unsold.map((unsold) => (
                <li key={unsold.playerEntryId}>
                  {unsold.displayName} —{" "}
                  {unsold.resolution === "final_unsold"
                    ? "Final Unsold"
                    : "In the Unsold Pool"}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <PlayerDetails view={view} />
    </div>
  );
}
