"use client";

/* eslint-disable react-hooks/incompatible-library */

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FilterX,
  Search,
  Users,
  X,
} from "lucide-react";


import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { isMustHaveTier } from "@/domain/tier";
import type {
  SerializedTier,
  SerializedTierAssignment,
} from "@/features/auctions/setup/serialize-team";
import { cn } from "cn";

interface TierAssignmentsTableProps {
  assignments: SerializedTierAssignment[];
  onAssignBulk: (
    playerEntryIds: string[],
    tierId: null | string,
  ) => Promise<boolean>;
  onAssignSingle: (
    playerEntryId: string,
    tierId: null | string,
  ) => Promise<boolean>;
  pending?: boolean;
  teamCount?: number;
  tiers: SerializedTier[];
}

export function TierAssignmentsTable({
  assignments,
  onAssignBulk,
  onAssignSingle,
  pending = false,
  teamCount = 0,
  tiers,
}: TierAssignmentsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { desc: false, id: "displayName" },
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [tierFilter, setTierFilter] = React.useState<string>("all");
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [bulkActionValue, setBulkActionValue] = React.useState<string>("");

  // Map of tierId -> Tier
  const tierMap = React.useMemo(
    () => new Map(tiers.map((t) => [t.id, t])),
    [tiers],
  );

  // Compute counts per tier
  const tierCounts = React.useMemo(() => {
    const counts = new Map<string | null, number>();
    for (const a of assignments) {
      const current = counts.get(a.tierId) ?? 0;
      counts.set(a.tierId, current + 1);
    }
    return counts;
  }, [assignments]);

  // Selected player IDs
  const selectedPlayerIds = React.useMemo(
    () => Object.keys(rowSelection),
    [rowSelection],
  );

  const selectedCount = selectedPlayerIds.length;

  // Columns definition
  const columns = React.useMemo<ColumnDef<SerializedTierAssignment>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => {
          const isAllSelected = table.getIsAllPageRowsSelected();
          const isSomeSelected = table.getIsSomePageRowsSelected();
          return (
            <div className="flex items-center justify-center pl-1">
              <Checkbox
                aria-label="Select all players on this page"
                checked={isAllSelected}
                indeterminate={isSomeSelected && !isAllSelected}
                onCheckedChange={(checked) =>
                  table.toggleAllPageRowsSelected(!!checked)
                }
              />
            </div>
          );
        },
        cell: ({ row }) => (
          <div className="flex items-center justify-center pl-1">
            <Checkbox
              aria-label={`Select ${row.original.displayName}`}
              checked={row.getIsSelected()}
              onCheckedChange={(checked) => row.toggleSelected(!!checked)}
            />
          </div>
        ),
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: "displayName",
        header: ({ column }) => {
          const isSorted = column.getIsSorted();
          return (
            <Button
              className="-ml-2 h-8 px-2 font-semibold hover:text-foreground"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              size="sm"
              variant="ghost"
            >
              Player
              {isSorted === "asc" ? (
                <ArrowUp className="ml-1 size-3.5" />
              ) : isSorted === "desc" ? (
                <ArrowDown className="ml-1 size-3.5" />
              ) : (
                <ArrowUpDown className="ml-1 size-3.5 opacity-50" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const entry = row.original;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">
                {entry.displayName}
              </span>
              {entry.role && (
                <Badge className="text-[11px]" variant="secondary">
                  {entry.role}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "tierId",
        header: ({ column }) => {
          const isSorted = column.getIsSorted();
          return (
            <div className="flex items-center justify-end">
              <Button
                className="-mr-2 h-8 px-2 font-semibold hover:text-foreground"
                onClick={() =>
                  column.toggleSorting(column.getIsSorted() === "asc")
                }
                size="sm"
                variant="ghost"
              >
                Assigned Tier
                {isSorted === "asc" ? (
                  <ArrowUp className="ml-1 size-3.5" />
                ) : isSorted === "desc" ? (
                  <ArrowDown className="ml-1 size-3.5" />
                ) : (
                  <ArrowUpDown className="ml-1 size-3.5 opacity-50" />
                )}
              </Button>
            </div>
          );
        },
        cell: ({ row }) => {
          const assignment = row.original;
          const currentTier = assignment.tierId
            ? tierMap.get(assignment.tierId)
            : null;

          return (
            <div className="flex items-center justify-end">
              <Select
                disabled={pending}
                items={[
                  { label: "Unassigned", value: "unassigned" },
                  ...tiers.map((tier) => {
                    const isMustHave = isMustHaveTier(tier);
                    const capacity =
                      isMustHave && teamCount > 0
                        ? teamCount * tier.minPerTeam
                        : null;
                    const count = tierCounts.get(tier.id) ?? 0;
                    const isFull =
                      capacity !== null &&
                      count >= capacity &&
                      assignment.tierId !== tier.id;
                    return {
                      disabled: isFull,
                      label: isFull
                        ? `${tier.label} (Capacity Reached)`
                        : tier.label,
                      value: tier.id,
                    };
                  }),
                ]}
                onValueChange={async (val) => {
                  const targetTierId =
                    val === "unassigned" || !val ? null : val;
                  await onAssignSingle(assignment.id, targetTierId);
                }}
                value={assignment.tierId ?? "unassigned"}
              >
                <SelectTrigger
                  aria-label={`Tier for ${assignment.displayName}`}
                  className={cn(
                    "h-8 w-44 text-xs ml-auto",
                    currentTier
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                  size="sm"
                >
                  <SelectValue placeholder="Unassigned">
                    {(val: string | null) =>
                      val === "unassigned" || !val
                        ? "Unassigned"
                        : (tierMap.get(val)?.label ?? val)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {tiers.map((tier) => {
                      const isMustHave = isMustHaveTier(tier);
                      const capacity =
                        isMustHave && teamCount > 0
                          ? teamCount * tier.minPerTeam
                          : null;
                      const count = tierCounts.get(tier.id) ?? 0;
                      const isFull =
                        capacity !== null &&
                        count >= capacity &&
                        assignment.tierId !== tier.id;
                      return (
                        <SelectItem
                          disabled={isFull}
                          key={tier.id}
                          value={tier.id}
                        >
                          {tier.label}
                          {isFull ? " (Capacity Reached)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          );
        },
        sortingFn: (rowA, rowB) => {
          const tierA = rowA.original.tierId
            ? tierMap.get(rowA.original.tierId)
            : null;
          const tierB = rowB.original.tierId
            ? tierMap.get(rowB.original.tierId)
            : null;
          const posA = tierA ? tierA.position : 999999;
          const posB = tierB ? tierB.position : 999999;
          return posA - posB;
        },
      },

    ],
    [onAssignSingle, pending, teamCount, tierCounts, tierMap, tiers],
  );

  // Filtered by search & tier dropdown
  const filteredData = React.useMemo(() => {
    let result = assignments;
    if (tierFilter === "unassigned") {
      result = result.filter((a) => a.tierId === null);
    } else if (tierFilter !== "all") {
      result = result.filter((a) => a.tierId === tierFilter);
    }

    if (globalFilter.trim()) {
      const search = globalFilter.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.displayName.toLowerCase().includes(search) ||
          (a.role && a.role.toLowerCase().includes(search)),
      );
    }

    return result;
  }, [assignments, globalFilter, tierFilter]);

  const table = useReactTable({
    columns,
    data: filteredData,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      globalFilter,
      rowSelection,
      sorting,
    },
  });

  const isFiltered = Boolean(globalFilter.trim()) || tierFilter !== "all";

  function clearFilters() {
    setGlobalFilter("");
    setTierFilter("all");
  }

  async function handleBulkAssign(targetTierValue: string | null) {
    if (selectedPlayerIds.length === 0 || !targetTierValue) return;
    const targetTierId =
      targetTierValue === "unassigned" ? null : targetTierValue;
    const success = await onAssignBulk(selectedPlayerIds, targetTierId);
    if (success) {
      setRowSelection({});
      setBulkActionValue("");
    }
  }


  return (
    <div className="flex flex-col gap-4">
      {/* Search, Filter, and Bulk Actions Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[14rem] sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                className="pl-8 text-sm"
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Search players by name or role..."
                value={globalFilter}
              />
            </div>

            {/* Filter by Tier */}
            <Select
              items={[
                {
                  label: `All Players (${assignments.length})`,
                  value: "all",
                },
                {
                  label: `Unassigned (${tierCounts.get(null) ?? 0})`,
                  value: "unassigned",
                },
                ...tiers.map((t) => ({
                  label: `${t.label} (${tierCounts.get(t.id) ?? 0})`,
                  value: t.id,
                })),
              ]}
              onValueChange={(val) => setTierFilter(val ?? "all")}
              value={tierFilter}
            >
              <SelectTrigger aria-label="Filter by Tier" className="w-[12rem]">
                <SelectValue placeholder="Filter by Tier">
                  {(val: string | null) => {
                    if (val === "all" || !val) {
                      return `All Players (${assignments.length})`;
                    }
                    if (val === "unassigned") {
                      return `Unassigned (${tierCounts.get(null) ?? 0})`;
                    }
                    const tier = tierMap.get(val);
                    return `${tier?.label ?? val} (${tierCounts.get(val) ?? 0})`;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">
                    All Players ({assignments.length})
                  </SelectItem>
                  <SelectItem value="unassigned">
                    Unassigned ({tierCounts.get(null) ?? 0})
                  </SelectItem>
                  {tiers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label} ({tierCounts.get(t.id) ?? 0})
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            {/* Clear Filters Button */}
            {isFiltered && (
              <Button
                className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={clearFilters}
                size="sm"
                type="button"
                variant="ghost"
              >
                <FilterX className="size-3.5" />
                Reset filters
              </Button>
            )}
          </div>
        </div>

        {/* Bulk Action Bar (appears when rows are selected) */}
        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-2.5 transition-all">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-foreground">
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                {selectedCount}
              </span>
              <span>
                {selectedCount} {selectedCount === 1 ? "player" : "players"}{" "}
                selected
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Assign to:</span>
              <Select
                disabled={pending}
                items={[
                  { label: "Unassigned (Clear Tier)", value: "unassigned" },
                  ...tiers.map((tier) => {
                    const isMustHave = isMustHaveTier(tier);
                    const capacity =
                      isMustHave && teamCount > 0
                        ? teamCount * tier.minPerTeam
                        : null;
                    const count = tierCounts.get(tier.id) ?? 0;
                    // Remaining slots excluding currently selected players who are already in this tier
                    const currentlyInTierFromSelected =
                      selectedPlayerIds.filter(
                        (id) =>
                          assignments.find((a) => a.id === id)?.tierId ===
                          tier.id,
                      ).length;
                    const slotsNeeded =
                      selectedCount - currentlyInTierFromSelected;
                    const remainingSlots =
                      capacity !== null ? Math.max(0, capacity - count) : null;
                    const cannotFit =
                      remainingSlots !== null && slotsNeeded > remainingSlots;

                    return {
                      disabled: cannotFit,
                      label: cannotFit
                        ? `${tier.label} (${remainingSlots} slots left - cannot fit ${slotsNeeded})`
                        : remainingSlots !== null
                          ? `${tier.label} (${remainingSlots} slots left)`
                          : tier.label,
                      value: tier.id,
                    };
                  }),
                ]}
                onValueChange={handleBulkAssign}
                value={bulkActionValue}
              >
                <SelectTrigger className="h-8 w-56 text-xs bg-background">
                  <SelectValue placeholder="Choose a tier..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="unassigned">
                      Unassigned (Clear Tier)
                    </SelectItem>
                    {tiers.map((tier) => {
                      const isMustHave = isMustHaveTier(tier);
                      const capacity =
                        isMustHave && teamCount > 0
                          ? teamCount * tier.minPerTeam
                          : null;
                      const count = tierCounts.get(tier.id) ?? 0;
                      const currentlyInTierFromSelected =
                        selectedPlayerIds.filter(
                          (id) =>
                            assignments.find((a) => a.id === id)?.tierId ===
                            tier.id,
                        ).length;
                      const slotsNeeded =
                        selectedCount - currentlyInTierFromSelected;
                      const remainingSlots =
                        capacity !== null
                          ? Math.max(0, capacity - count)
                          : null;
                      const cannotFit =
                        remainingSlots !== null && slotsNeeded > remainingSlots;

                      return (
                        <SelectItem
                          disabled={cannotFit}
                          key={tier.id}
                          value={tier.id}
                        >
                          {tier.label}
                          {cannotFit
                            ? ` (${remainingSlots} slots left - cannot fit ${slotsNeeded})`
                            : remainingSlots !== null
                              ? ` (${remainingSlots} slots left)`
                              : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Button
                className="h-8 text-xs"
                onClick={() => setRowSelection({})}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X className="size-3.5" />
                Deselect
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* TanStack Table */}
      <div className="overflow-hidden rounded-lg border border-border/70">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className={cn(
                      header.column.id === "select" && "w-10 px-2",
                      header.column.id === "displayName" &&
                        "w-full min-w-[180px]",
                      header.column.id === "tierId" &&
                        "w-[240px] text-right pr-4",
                    )}
                    key={header.id}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  key={row.id}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      className={cn(
                        cell.column.id === "select" && "w-10 px-2",
                        cell.column.id === "displayName" &&
                          "w-full min-w-[180px]",
                        cell.column.id === "tierId" &&
                          "w-[240px] text-right pr-4",
                      )}
                      key={cell.id}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (

              <TableRow>
                <TableCell
                  className="h-36 whitespace-normal text-center"
                  colSpan={columns.length}
                >
                  {assignments.length === 0 ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Users aria-hidden />
                        </EmptyMedia>
                        <EmptyTitle>
                          No player entries found for this auction.
                        </EmptyTitle>
                        <EmptyDescription>
                          Add or import player entries in the Players station
                          first.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Search aria-hidden />
                        </EmptyMedia>
                        <EmptyTitle>No players match your filters.</EmptyTitle>
                        <EmptyDescription>
                          Try adjusting your search query or tier filter.
                        </EmptyDescription>
                      </EmptyHeader>
                      <div className="mt-2 flex justify-center">
                        <Button
                          onClick={clearFilters}
                          size="sm"
                          variant="outline"
                        >
                          Clear filters
                        </Button>
                      </div>
                    </Empty>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination & Readout */}
      {assignments.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              Showing{" "}
              <span className="font-medium text-foreground">
                {table.getFilteredRowModel().rows.length === 0
                  ? 0
                  : table.getState().pagination.pageIndex *
                      table.getState().pagination.pageSize +
                    1}
              </span>{" "}
              to{" "}
              <span className="font-medium text-foreground">
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) *
                    table.getState().pagination.pageSize,
                  table.getFilteredRowModel().rows.length,
                )}
              </span>{" "}
              of{" "}
              <span className="font-medium text-foreground">
                {table.getFilteredRowModel().rows.length}
              </span>{" "}
              players
              {isFiltered && ` (filtered from ${assignments.length} total)`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Rows per page</span>
              <Select
                onValueChange={(val) => val && table.setPageSize(Number(val))}
                value={String(table.getState().pagination.pageSize)}
              >
                <SelectTrigger
                  aria-label="Rows per page"
                  className="h-7 w-16"
                  size="sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              <span className="mr-1.5">
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {Math.max(1, table.getPageCount())}
              </span>
              <Button
                aria-label="First page"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.setPageIndex(0)}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <ChevronsLeft className="size-3.5" />
              </Button>
              <Button
                aria-label="Previous page"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                aria-label="Next page"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <ChevronRight className="size-3.5" />
              </Button>
              <Button
                aria-label="Last page"
                disabled={!table.getCanNextPage()}
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <ChevronsRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
