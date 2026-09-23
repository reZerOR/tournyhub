"use client";

import { memo, useId, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  FilterX,
  Layers3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  LivePlayerSummary,
  LiveTeamPublicState,
  LiveTierProgress,
} from "@/domain/live";
import {
  livePlayerColumns,
  PLAYER_STATUS_LABELS,
  summarizePlayers,
} from "./live-player-directory";
import { formatCredits, getTeamColor } from "./live-theme";

const statusVariants = {
  active: "neon",
  sold: "success",
  forced: "success",
  preassigned: "roster",
  waiting: "outline",
  unsold: "warning",
  final_unsold: "secondary",
} as const;
const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "remaining", label: "Remaining" },
  ...Object.entries(PLAYER_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];
const sortOptions = [
  { value: "default", label: "Tier order" },
  { value: "displayName:asc", label: "Player name: A–Z" },
  { value: "displayName:desc", label: "Player name: Z–A" },
  { value: "tierId:asc", label: "Tier name: A–Z" },
  { value: "tierId:desc", label: "Tier name: Z–A" },
  { value: "status:asc", label: "Status: A–Z" },
  { value: "status:desc", label: "Status: Z–A" },
  { value: "teamId:asc", label: "Team: A–Z" },
  { value: "teamId:desc", label: "Team: Z–A" },
  { value: "amount:asc", label: "Sale price: low to high" },
  { value: "amount:desc", label: "Sale price: high to low" },
];

function DirectorySelect({
  id,
  label,
  value,
  items,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(value) => {
          if (value !== null) onChange(value);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function PlayerTeam({ team }: { team: LiveTeamPublicState | undefined }) {
  return team ? (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: getTeamColor(team) }}
        aria-hidden
      />
      <span className="break-words">
        {team.name ?? `Team ${team.position + 1}`}
      </span>
    </span>
  ) : (
    <span className="text-muted-foreground">Not assigned</span>
  );
}

/** Shared read-only directory. Filters, sorting and pagination survive live updates. */
export const LivePlayersPanel = memo(function LivePlayersPanel({
  players,
  tiers,
  teams,
  connectionStale,
}: {
  players: LivePlayerSummary[];
  tiers: LiveTierProgress[];
  teams: LiveTeamPublicState[];
  connectionStale: boolean;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });
  const teamsById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams],
  );
  const tiersById = useMemo(
    () => new Map(tiers.map((tier) => [tier.id, tier])),
    [tiers],
  );
  const columns = useMemo(
    () =>
      livePlayerColumns(
        new Map(tiers.map((tier) => [tier.id, tier.label])),
        new Map(
          teams.map((team) => [
            team.id,
            team.name ?? `Team ${team.position + 1}`,
          ]),
        ),
      ).map((column) => ({
        ...column,
        cell: ({
          row,
          column,
          getValue,
        }: import("@tanstack/react-table").CellContext<
          LivePlayerSummary,
          unknown
        >) => {
          const player = row.original;
          if (column.id === "status")
            return (
              <Badge variant={statusVariants[player.status]}>
                {PLAYER_STATUS_LABELS[player.status]}
              </Badge>
            );
          if (column.id === "teamId")
            return <PlayerTeam team={teamsById.get(player.teamId ?? "")} />;
          if (column.id === "amount")
            return (
              <span className="tabular-nums">
                {player.amount === null
                  ? "—"
                  : `${formatCredits(player.amount)} cr`}
              </span>
            );
          return String(getValue());
        },
      })),
    [tiers, teams, teamsById],
  );

  // TanStack exposes mutable instance methods; keep this hook out of compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: players,
    columns,
    getRowId: (player) => player.id,
    state: {
      columnFilters,
      sorting,
      pagination,
      columnVisibility: { tierId: tiers.length > 0 },
    },
    onColumnFiltersChange: (updater) => {
      setColumnFilters(updater);
      setPagination((previous) => ({ ...previous, pageIndex: 0 }));
    },
    onSortingChange: (updater) => {
      setSorting(updater);
      setPagination((previous) => ({ ...previous, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    enableMultiSort: false,
    defaultColumn: { sortDescFirst: false },
  });
  const pageCount = Math.max(1, table.getPageCount());
  // A sale can remove the last match on the last page. Clamp before rendering.
  if (pagination.pageIndex >= pageCount)
    setPagination({ ...pagination, pageIndex: pageCount - 1 });
  const rows = table.getRowModel().rows;
  const matchingCount = table.getFilteredRowModel().rows.length;
  const filterValue = (columnId: string) =>
    String(table.getColumn(columnId)?.getFilterValue() ?? "all");
  const setFilter = (columnId: string, value: string) =>
    table
      .getColumn(columnId)
      ?.setFilterValue(value === "all" ? undefined : value);
  const tierId = filterValue("tierId");
  const counts = summarizePlayers(
    players.filter(
      (player) =>
        tierId === "all" || (player.tierId ?? "unassigned") === tierId,
    ),
  );
  const tierOptions = [
    { value: "all", label: `All tiers (${players.length})` },
    ...tiers.map((tier) => ({
      value: tier.id,
      label: `${tier.label}${tier.isActive ? " · Active Tier" : ""} (${players.filter((player) => player.tierId === tier.id).length})`,
    })),
    ...(players.some((player) => player.tierId === null)
      ? [{ value: "unassigned", label: "Unassigned" }]
      : []),
  ];
  const teamOptions = [
    { value: "all", label: "All teams" },
    { value: "unassigned", label: "Not assigned" },
    ...teams.map((team) => ({
      value: team.id,
      label: team.name ?? `Team ${team.position + 1}`,
    })),
  ];
  const sortValue = sorting[0]
    ? `${sorting[0].id}:${sorting[0].desc ? "desc" : "asc"}`
    : "default";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle role="heading" aria-level={2}>
              {tiers.length ? "Players by tier" : "All players"}
            </CardTitle>
            <CardDescription>
              Browse every Player, their status, and their Team without leaving
              the live Auction.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            aria-expanded={expanded}
            aria-controls={`${id}-directory`}
            onClick={() => setExpanded(!expanded)}
          >
            <Layers3 data-icon="inline-start" />
            {expanded ? "Hide players" : "Browse players"}
            {expanded ? (
              <ChevronUp data-icon="inline-end" />
            ) : (
              <ChevronDown data-icon="inline-end" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent id={`${id}-directory`} hidden={!expanded}>
        {expanded && (
          <div className="flex min-w-0 flex-col gap-4">
            {connectionStale && (
              <p role="status" className="text-sm text-warning">
                Reconnecting. Player statuses show the last received update.
              </p>
            )}
            <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field>
                <FieldLabel htmlFor={`${id}-search`}>Search players</FieldLabel>
                <Input
                  id={`${id}-search`}
                  placeholder="Player name"
                  value={String(
                    table.getColumn("displayName")?.getFilterValue() ?? "",
                  )}
                  onChange={(event) =>
                    table
                      .getColumn("displayName")
                      ?.setFilterValue(event.target.value)
                  }
                />
              </Field>
              {tiers.length > 0 && (
                <DirectorySelect
                  id={`${id}-tier`}
                  label="Tier"
                  value={tierId}
                  items={tierOptions}
                  onChange={(value) => setFilter("tierId", value)}
                />
              )}
              <DirectorySelect
                id={`${id}-status`}
                label="Player status"
                value={filterValue("status")}
                items={statusOptions}
                onChange={(value) => setFilter("status", value)}
              />
              <DirectorySelect
                id={`${id}-team`}
                label="Team"
                value={filterValue("teamId")}
                items={teamOptions}
                onChange={(value) => setFilter("teamId", value)}
              />
            </FieldGroup>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="w-full sm:w-64">
                <DirectorySelect
                  id={`${id}-sort`}
                  label="Sort players"
                  value={sortValue}
                  items={sortOptions.filter(
                    (option) =>
                      tiers.length > 0 || !option.value.startsWith("tierId:"),
                  )}
                  onChange={(value) => {
                    const [columnId, direction] = value.split(":");
                    table.setSorting(
                      value === "default"
                        ? []
                        : [{ id: columnId!, desc: direction === "desc" }],
                    );
                  }}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={columnFilters.length === 0}
                onClick={() => table.resetColumnFilters()}
              >
                <FilterX data-icon="inline-start" />
                Reset filters
              </Button>
            </div>
            <div
              className="flex flex-wrap items-center gap-2 tabular-nums"
              aria-label="Selected tier totals"
            >
              <Badge variant="outline">{counts.total} total</Badge>
              <Badge variant="success">{counts.sold} sold / assigned</Badge>
              <Badge variant="neon">{counts.remaining} remaining</Badge>
              <Badge variant="roster">
                {counts.preassigned}{" "}
                {counts.preassigned === 1
                  ? "representative"
                  : "representatives"}
              </Badge>
              {counts.finalUnsold > 0 && (
                <Badge variant="secondary">
                  {counts.finalUnsold} Final Unsold
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Totals cover the selected Tier. Remaining includes waiting
              Players, the Active Player, and the Unsold Pool. Representatives
              are preassigned, not sold.
            </p>
            {matchingCount === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No matching Players</EmptyTitle>
                  <EmptyDescription>
                    Try another Tier, status, Team, or Player name.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="max-h-96 min-w-0 overflow-auto rounded-lg border">
                <ul
                  className="divide-y divide-border md:hidden"
                  aria-label="Player statuses"
                >
                  {rows.map(({ original: player }) => (
                    <li key={player.id} className="flex flex-col gap-2 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="min-w-0 font-medium break-words">
                          {player.displayName}
                        </span>
                        <Badge variant={statusVariants[player.status]}>
                          {PLAYER_STATUS_LABELS[player.status]}
                        </Badge>
                      </div>
                      {tiers.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {tiersById.get(player.tierId ?? "")?.label ??
                            "Unassigned"}
                        </span>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <PlayerTeam team={teamsById.get(player.teamId ?? "")} />
                        {player.amount !== null && (
                          <span className="tabular-nums">
                            {formatCredits(player.amount)} cr
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <Table aria-label="Live player directory">
                    <TableHeader>
                      {table.getHeaderGroups().map((group) => (
                        <TableRow key={group.id}>
                          {group.headers.map((header) => (
                            <TableHead
                              key={header.id}
                              aria-sort={
                                header.column.getIsSorted() === "asc"
                                  ? "ascending"
                                  : header.column.getIsSorted() === "desc"
                                    ? "descending"
                                    : "none"
                              }
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={header.column.getToggleSortingHandler()}
                                aria-label={`Sort by ${header.column.columnDef.header}`}
                              >
                                {flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                                {header.column.getIsSorted() === "asc" ? (
                                  <ArrowUp data-icon="inline-end" />
                                ) : header.column.getIsSorted() === "desc" ? (
                                  <ArrowDown data-icon="inline-end" />
                                ) : (
                                  <ArrowUpDown data-icon="inline-end" />
                                )}
                              </Button>
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-xs text-muted-foreground tabular-nums">
                {matchingCount} matching Players · Page{" "}
                {pagination.pageIndex + 1} of {pageCount}
              </p>
              <div className="w-32">
                <DirectorySelect
                  id={`${id}-page-size`}
                  label="Players per page"
                  value={String(pagination.pageSize)}
                  items={[10, 25, 50, 100].map((size) => ({
                    value: String(size),
                    label: String(size),
                  }))}
                  onChange={(value) =>
                    table.setPagination({
                      pageIndex: 0,
                      pageSize: Number(value),
                    })
                  }
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.previousPage()}
                >
                  Previous players
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.nextPage()}
                >
                  Next players
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
