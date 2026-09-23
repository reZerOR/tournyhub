import { Download, FileText, Sheet, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  HIDDEN_PHONE,
  RESULTS_SOURCE_LABELS,
  resultsTeamColor,
  teamRosterText,
  type AuctionResultsView,
  type ResultsTeamView,
} from "@/domain/results";
import { TeamActions } from "./team-actions";

const number = (value: number) => value.toLocaleString("en-US");

function TeamRoster({
  team,
  view,
  auctionId,
}: {
  team: ResultsTeamView;
  view: AuctionResultsView;
  auctionId: string;
}) {
  const name = team.name ?? "Unnamed Team";
  const color = resultsTeamColor(team.color);
  const tiers = new Map<string, number>();
  for (const player of team.players) {
    const label = player.tierLabel ?? "Unassigned";
    tiers.set(label, (tiers.get(label) ?? 0) + 1);
  }
  return (
    <section
      id={`team-${team.id}`}
      aria-labelledby={`team-title-${team.id}`}
      className="min-w-0 scroll-mt-6"
    >
      <Card className="gap-0 pt-0">
        <CardHeader
          className="relative gap-3 px-5 py-7 text-center sm:px-8"
          style={{
            backgroundColor: `color-mix(in oklab, ${color} 12%, var(--card))`,
          }}
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1"
            style={{ backgroundColor: color }}
          />
          <CardTitle>
            <h3
              id={`team-title-${team.id}`}
              className="text-2xl font-semibold tracking-tight break-words sm:text-3xl"
            >
              {name}
            </h3>
          </CardTitle>
          <CardDescription>
            {view.viewerTeamId === team.id ? "Your team roster" : "Team roster"}
          </CardDescription>
          <dl className="mx-auto mt-2 grid w-full max-w-lg grid-cols-3 divide-x divide-border">
            <div className="flex flex-col gap-1 px-2">
              <dt className="text-xs text-muted-foreground">Players</dt>
              <dd className="font-mono text-base font-medium tabular-nums sm:text-lg">
                {team.rosterCount}
              </dd>
            </div>
            <div className="flex flex-col gap-1 px-2">
              <dt className="text-xs text-muted-foreground">Spent</dt>
              <dd className="font-mono text-base font-medium tabular-nums sm:text-lg">
                {number(team.spentCredits)}{" "}
                <span className="text-xs text-muted-foreground">cr</span>
              </dd>
            </div>
            <div className="flex flex-col gap-1 px-2">
              <dt className="text-xs text-muted-foreground">Remaining</dt>
              <dd className="font-mono text-base font-medium tabular-nums sm:text-lg">
                {number(team.remainingBudget)}{" "}
                <span className="text-xs text-muted-foreground">cr</span>
              </dd>
            </div>
          </dl>
        </CardHeader>
        <CardContent className="px-0">
          {view.rulesMode === "tiered" && tiers.size > 0 && (
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-y px-5 py-3 text-xs text-muted-foreground">
              {Array.from(tiers, ([label, count]) => (
                <span key={label}>
                  {label}{" "}
                  <span className="ml-1 font-mono text-foreground">
                    {count}
                  </span>
                </span>
              ))}
            </div>
          )}
          {team.players.length ? (
            <Table aria-label={`${name} players`}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 pl-5">#</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead className="hidden sm:table-cell">Source</TableHead>
                  {view.rulesMode === "tiered" && (
                    <TableHead className="hidden md:table-cell">Tier</TableHead>
                  )}
                  <TableHead className="pr-5 text-right">Credits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.players.map((player, index) => (
                  <TableRow key={player.playerEntryId}>
                    <TableCell className="pl-5">
                      <span className="font-mono text-xs text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-48 py-4 whitespace-normal sm:max-w-none">
                      <span className="font-medium break-words">
                        {player.displayName}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground sm:hidden">
                        {RESULTS_SOURCE_LABELS[player.source]}
                      </span>
                      {view.rulesMode === "tiered" && (
                        <span className="mt-1 block text-xs text-muted-foreground md:hidden">
                          {player.tierLabel ?? "Unassigned"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {RESULTS_SOURCE_LABELS[player.source]}
                      </span>
                    </TableCell>
                    {view.rulesMode === "tiered" && (
                      <TableCell className="hidden md:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {player.tierLabel ?? "Unassigned"}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="pr-5 text-right">
                      <span className="font-mono tabular-nums">
                        {player.source === "representative" ? (
                          <span
                            aria-label="Not purchased"
                            className="text-muted-foreground"
                          >
                            -
                          </span>
                        ) : (
                          number(player.amount)
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No players acquired.
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-center px-5 py-4">
          <TeamActions
            auctionId={auctionId}
            teamId={team.id}
            teamName={name}
            rosterText={teamRosterText(view.title, team, view.rulesMode)}
            canExportContacts={
              view.viewerRole === "organizer" || view.viewerTeamId === team.id
            }
          />
        </CardFooter>
      </Card>
    </section>
  );
}

function PlayerDetailsSection({ view }: { view: AuctionResultsView }) {
  return (
    <div className="rounded-xl border bg-muted/20">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors select-none hover:bg-muted/30">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          Show Player details
          <span className="ml-auto text-xs font-normal text-muted-foreground"></span>
        </summary>

        <div className="border-t">
          <p className="px-4 py-3 text-xs text-muted-foreground">
            The Organizer always sees every phone number. A Representative sees
            them while the Auction is Live or Paused, and afterwards only for
            their own Roster. A PDF never includes one.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Player
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Team
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Tier
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Rep
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Phone
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.contacts.map((contact) => (
                  <tr
                    key={contact.playerEntryId}
                    className="border-b last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-4 py-2 font-medium">
                      {contact.displayName}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {contact.teamName ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {contact.tierLabel ?? "—"}
                    </td>
                    <td className="px-2 py-2">
                      {contact.isRepresentative ? (
                        <span className="text-xs font-medium text-neon">
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs tabular-nums">
                      {contact.phoneWithheld ? (
                        <span className="text-muted-foreground">
                          {HIDDEN_PHONE}
                        </span>
                      ) : (
                        (contact.phoneNumber ?? (
                          <span className="text-muted-foreground">—</span>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
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
  const totalPlayers = view.results.teams.reduce(
    (sum, team) => sum + team.rosterCount,
    0,
  );
  const totalSpent = view.results.teams.reduce(
    (sum, team) => sum + team.spentCredits,
    0,
  );
  const base = `/app/auctions/${auctionId}/results/export`;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <header className="flex flex-col gap-5 border-b pb-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {published ? "Auction Results" : "Auction in Progress"}
              </h2>
              <Badge
                variant={
                  view.status === "completed"
                    ? "success"
                    : view.status === "cancelled"
                      ? "destructive"
                      : "secondary"
                }
              >
                {view.status.charAt(0).toUpperCase() + view.status.slice(1)}
              </Badge>
            </div>
            <p className="text-sm break-words text-muted-foreground">
              {view.title || "Untitled Auction"} &middot;{" "}
              {view.rulesMode === "tiered" ? "Tiered" : "Simple"} rules
            </p>
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Download auction results"
          >
            <a
              className={buttonVariants({ variant: "default" })}
              href={`${base}/xlsx`}
              download
            >
              <Sheet data-icon="inline-start" />
              Download Excel
            </a>
            <a
              className={buttonVariants({ variant: "outline" })}
              href={`${base}/pdf`}
              download
            >
              <FileText data-icon="inline-start" />
              Download PDF
            </a>
            <a
              className={buttonVariants({ variant: "ghost" })}
              href={`${base}/csv`}
              download
            >
              <Download data-icon="inline-start" />
              CSV
            </a>
          </div>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Excel keeps team colors and centered headings. CSV contains grouped
          rows. PDFs and copied rosters leave out phone numbers.
        </p>
        <p className="text-xs text-muted-foreground">
          {view.viewerRole === "organizer"
            ? "Excel and CSV include all supplied contacts."
            : "Excel and CSV contain your team's roster and contacts only."}
        </p>
        {published && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {view.results.teams.length}
            </span>{" "}
            teams{" "}
            <span aria-hidden className="mx-2">
              /
            </span>
            <span className="font-medium text-foreground">{totalPlayers}</span>{" "}
            players{" "}
            <span aria-hidden className="mx-2">
              /
            </span>
            <span className="font-mono text-foreground">
              {number(totalSpent)} cr
            </span>{" "}
            spent
          </p>
        )}
      </header>

      {published ? (
        <>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">Team rosters</h2>
              <p className="text-sm text-muted-foreground">
                Copy or download a roster to share with your team.
              </p>
            </div>
            {view.results.teams.length > 1 && (
              <nav aria-label="Jump to team" className="flex flex-wrap gap-2">
                {view.results.teams.map((team) => (
                  <a
                    key={team.id}
                    href={`#team-${team.id}`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: resultsTeamColor(team.color) }}
                    />
                    <span className="max-w-52 truncate">
                      {team.name ?? "Unnamed Team"}
                    </span>
                  </a>
                ))}
              </nav>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-7">
            {view.results.teams.map((team) => (
              <TeamRoster
                key={team.id}
                team={team}
                view={view}
                auctionId={auctionId}
              />
            ))}
            {!view.results.teams.length && (
              <p className="py-8 text-center text-muted-foreground">
                No team rosters available.
              </p>
            )}
          </div>
          {view.results.unsold.length > 0 && (
            <section aria-labelledby="unsold-title">
              <h2 id="unsold-title" className="mb-3 text-lg font-semibold">
                Unsold Players{" "}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {view.results.unsold.length}
                </span>
              </h2>
              <ul className="divide-y border-y">
                {view.results.unsold.map((player) => (
                  <li
                    key={player.playerEntryId}
                    className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                  >
                    <span>{player.displayName}</span>
                    <span className="text-muted-foreground">
                      {player.resolution === "final_unsold"
                        ? "Final unsold"
                        : "Unsold pool"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <div className="py-10 text-center">
          <Users
            className="mx-auto mb-3 size-8 text-muted-foreground"
            aria-hidden
          />
          <p className="font-medium">Results not yet available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Rosters are published when the Auction completes or is cancelled.
          </p>
        </div>
      )}

      <PlayerDetailsSection view={view} />
    </div>
  );
}
