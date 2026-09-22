"use client";

/* eslint-disable react-hooks/incompatible-library */

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
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
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { normalizeDisplayName } from "@/domain/player-entry";
import type {
  SerializedCustomPlayerField,
  SerializedPlayerEntry,
} from "@/features/auctions/setup/serialize-player";

interface PlayerTableProps {
  customFields: SerializedCustomPlayerField[];
  duplicateNames: Set<string>;
  entries: SerializedPlayerEntry[];
  onAddClick: () => void;
  onEditClick: (entry: SerializedPlayerEntry) => void;
  onRemoveClick: (id: string) => void;
  pending?: boolean;
}

export function PlayerTable({
  customFields,
  duplicateNames,
  entries,
  onAddClick,
  onEditClick,
  onRemoveClick,
  pending = false,
}: PlayerTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { desc: false, id: "displayName" },
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>("all");

  const roles = React.useMemo(() => {
    const set = new Set<string>();
    for (const entry of entries) {
      if (entry.role?.trim()) {
        set.add(entry.role.trim());
      }
    }
    return Array.from(set).sort();
  }, [entries]);

  const columns = React.useMemo<ColumnDef<SerializedPlayerEntry>[]>(
    () => [
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
              Name
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
          const isDuplicate = duplicateNames.has(
            normalizeDisplayName(entry.displayName),
          );
          return (
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">
                {entry.displayName}
              </span>
              {isDuplicate && <Badge variant="warning">Duplicate</Badge>}
            </div>
          );
        },
      },
      {
        accessorKey: "role",
        header: ({ column }) => {
          const isSorted = column.getIsSorted();
          return (
            <Button
              className="-ml-2 h-8 px-2 font-semibold hover:text-foreground"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              size="sm"
              variant="ghost"
            >
              Role
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
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.role || "—"}
          </span>
        ),
      },
      {
        accessorKey: "externalPlayerId",
        header: ({ column }) => {
          const isSorted = column.getIsSorted();
          return (
            <Button
              className="-ml-2 h-8 px-2 font-semibold hover:text-foreground"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              size="sm"
              variant="ghost"
            >
              External ID
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
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.externalPlayerId || "—"}
          </span>
        ),
      },
      {
        accessorKey: "startingPriceOverride",
        header: ({ column }) => {
          const isSorted = column.getIsSorted();
          return (
            <div className="flex justify-end">
              <Button
                className="-mr-2 h-8 px-2 font-semibold hover:text-foreground"
                onClick={() =>
                  column.toggleSorting(column.getIsSorted() === "asc")
                }
                size="sm"
                variant="ghost"
              >
                Starting price
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
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums text-muted-foreground">
            {row.original.startingPriceOverride ?? "—"}
          </div>
        ),
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.startingPriceOverride ?? -1;
          const b = rowB.original.startingPriceOverride ?? -1;
          return a > b ? 1 : a < b ? -1 : 0;
        },
      },
      {
        id: "customValues",
        header: "Custom values",
        cell: ({ row }) => {
          if (customFields.length === 0) {
            return <span className="text-muted-foreground">—</span>;
          }
          const hasValues = customFields.some(
            (field) => row.original.customValues[field.id],
          );
          if (!hasValues) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {customFields.map((field) => {
                const val = row.original.customValues[field.id];
                if (!val) return null;
                return (
                  <li key={field.id} className="truncate max-w-xs">
                    <span className="font-medium text-foreground/80">
                      {field.label}:
                    </span>{" "}
                    {val}
                  </li>
                );
              })}
            </ul>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1.5">
            <Button
              disabled={pending}
              onClick={() => onEditClick(row.original)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Pencil className="size-3.5" />
              Edit
            </Button>
            <Button
              disabled={pending}
              onClick={() => onRemoveClick(row.original.id)}
              size="sm"
              type="button"
              variant="destructive"
            >
              <Trash2 className="size-3.5" />
              Remove
            </Button>
          </div>
        ),
      },
    ],
    [customFields, duplicateNames, onEditClick, onRemoveClick, pending],
  );

  const globalFilterFn = React.useCallback(
    (
      row: { original: SerializedPlayerEntry },
      _columnId: string,
      filterValue: string,
    ) => {
      const search = filterValue.toLowerCase().trim();
      if (!search) return true;
      const entry = row.original;
      if (entry.displayName.toLowerCase().includes(search)) return true;
      if (entry.role?.toLowerCase().includes(search)) return true;
      if (entry.externalPlayerId?.toLowerCase().includes(search)) return true;
      if (entry.phoneNumber?.toLowerCase().includes(search)) return true;
      if (entry.startingPriceOverride?.toString().includes(search)) return true;
      for (const val of Object.values(entry.customValues)) {
        if (val.toLowerCase().includes(search)) return true;
      }
      return false;
    },
    [],
  );

  // Apply role filter to data
  const filteredData = React.useMemo(() => {
    if (roleFilter === "all") return entries;
    return entries.filter(
      (entry) => (entry.role?.trim() || "") === roleFilter,
    );
  }, [entries, roleFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      columnFilters,
      globalFilter,
      sorting,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const isFiltered = Boolean(globalFilter.trim()) || roleFilter !== "all";

  function clearFilters() {
    setGlobalFilter("");
    setRoleFilter("all");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: Search, Role filter, Add Player action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[14rem] sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              className="pl-8"
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Filter players by name, role, ID..."
              value={globalFilter}
            />
          </div>

          {roles.length > 0 && (
            <Select
              items={[
                { label: "All Roles", value: "all" },
                ...roles.map((role) => ({ label: role, value: role })),
              ]}
              onValueChange={(val) => setRoleFilter(val ?? "all")}
              value={roleFilter}
            >
              <SelectTrigger aria-label="Filter by role" className="w-[11rem]">
                <SelectValue placeholder="Filter by role">
                  {(val: string | null) =>
                    val === "all" || !val ? "All Roles" : val
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}

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

        <Button onClick={onAddClick} type="button">
          <Plus className="size-4" />
          Add Player
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border/70">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-36 text-center whitespace-normal"
                  colSpan={columns.length}
                >
                  {entries.length === 0 ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Users aria-hidden />
                        </EmptyMedia>
                        <EmptyTitle>
                          You haven&apos;t added any Player Entries yet.
                        </EmptyTitle>
                        <EmptyDescription>
                          Import a CSV or XLSX file, or click &quot;Add Player&quot; to add entries.
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
                          Try adjusting your search query or role filter.
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
      {entries.length > 0 && (
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
              {isFiltered && ` (filtered from ${entries.length} total)`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Rows per page</span>
              <Select
                onValueChange={(val) => val && table.setPageSize(Number(val))}
                value={String(table.getState().pagination.pageSize)}
              >
                <SelectTrigger aria-label="Rows per page" className="h-7 w-16" size="sm">
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
