"use client";

/* eslint-disable react-hooks/incompatible-library */

import * as React from "react";
import Image from "next/image";
import {
  type ColumnDef,
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
  Upload,
  Users,
} from "lucide-react";

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
import type { SerializedTeam } from "@/features/auctions/setup/serialize-team";

function representativeLabel(team: SerializedTeam): string {
  if (team.representativeType === "player") return "Player Representative";
  if (team.representativeType === "outside") return "Outside Representative";
  return "No representative";
}

function ColorSwatch({ color }: { color: null | string }) {
  if (!color) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block size-4 shrink-0 rounded-md border border-foreground/20 shadow-xs"
        style={{ backgroundColor: color }}
      />
      <span className="font-mono text-xs uppercase">{color}</span>
    </span>
  );
}

interface TeamTableProps {
  onAddClick: () => void;
  onEditClick: (team: SerializedTeam) => void;
  onMoveClick: (teamId: string, direction: "down" | "up") => void;
  onRemoveClick: (teamId: string) => void;
  onRemoveLogoClick: (teamId: string) => void;
  onUploadLogoSubmit: (
    event: React.FormEvent<HTMLFormElement>,
    teamId: string,
  ) => void;
  pending?: boolean;
  teams: SerializedTeam[];
}

export function TeamTable({
  onAddClick,
  onEditClick,
  onMoveClick,
  onRemoveClick,
  onRemoveLogoClick,
  onUploadLogoSubmit,
  pending = false,
  teams,
}: TeamTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { desc: false, id: "position" },
  ]);
  const [globalFilter, setGlobalFilter] = React.useState("");

  const columns = React.useMemo<ColumnDef<SerializedTeam>[]>(
    () => [
      {
        accessorKey: "position",
        header: "Order",
        cell: ({ row }) => {
          const team = row.original;
          const index = teams.findIndex((t) => t.id === team.id);
          const isFirst = index === 0;
          const isLast = index === teams.length - 1;

          return (
            <div className="flex items-center gap-1">
              <span className="w-5 font-mono text-xs text-muted-foreground tabular-nums">
                #{team.position + 1}
              </span>
              <Button
                aria-label={`Move ${team.name ?? "Team"} up`}
                disabled={pending || isFirst}
                onClick={() => onMoveClick(team.id, "up")}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ArrowUp aria-hidden className="size-3.5" />
              </Button>
              <Button
                aria-label={`Move ${team.name ?? "Team"} down`}
                disabled={pending || isLast}
                onClick={() => onMoveClick(team.id, "down")}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ArrowDown aria-hidden className="size-3.5" />
              </Button>
            </div>
          );
        },
      },
      {
        accessorKey: "name",
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
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.name ?? "Unnamed Team"}
          </span>
        ),
      },
      {
        accessorKey: "color",
        header: "Color",
        cell: ({ row }) => <ColorSwatch color={row.original.color} />,
      },
      {
        id: "logo",
        header: "Logo",
        cell: ({ row }) => {
          const team = row.original;
          return (
            <div className="flex items-center gap-3">
              {team.logoHref ? (
                <div className="relative size-8 shrink-0 overflow-hidden rounded-md border border-border/80 bg-card">
                  <Image
                    alt={`${team.name ?? "Team"} logo`}
                    className="size-full object-contain p-0.5"
                    height={32}
                    src={team.logoHref}
                    width={32}
                  />
                </div>
              ) : (
                <div className="size-8 shrink-0 rounded-md border border-dashed border-border/70 bg-muted/20" />
              )}

              <div className="flex flex-col gap-1">
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(event) => onUploadLogoSubmit(event, team.id)}
                >
                  <Input
                    accept="image/png"
                    aria-label={`Logo file for ${team.name ?? "Team"}`}
                    className="h-7 max-w-36 text-xs file:mr-2 file:text-xs"
                    name="logo"
                    type="file"
                  />
                  <Button
                    disabled={pending}
                    size="sm"
                    type="submit"
                    variant="outline"
                  >
                    <Upload className="size-3" />
                    Upload
                  </Button>
                </form>
                {team.logoHref && (
                  <button
                    className="text-left text-xs text-destructive hover:underline"
                    disabled={pending}
                    onClick={() => onRemoveLogoClick(team.id)}
                    type="button"
                  >
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "representative",
        header: ({ column }) => {
          const isSorted = column.getIsSorted();
          return (
            <Button
              className="-ml-2 h-8 px-2 font-semibold hover:text-foreground"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              size="sm"
              variant="ghost"
            >
              Representative
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
            {representativeLabel(row.original)}
          </span>
        ),
        sortingFn: (rowA, rowB) => {
          const a = representativeLabel(rowA.original);
          const b = representativeLabel(rowB.original);
          return a.localeCompare(b);
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const team = row.original;
          return (
            <div className="flex justify-end gap-1.5">
              <Button
                disabled={pending}
                onClick={() => onEditClick(team)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Pencil className="size-3.5" />
                Edit
              </Button>
              <Button
                disabled={pending}
                onClick={() => onRemoveClick(team.id)}
                size="sm"
                type="button"
                variant="destructive"
              >
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            </div>
          );
        },
      },
    ],
    [
      onEditClick,
      onMoveClick,
      onRemoveClick,
      onRemoveLogoClick,
      onUploadLogoSubmit,
      pending,
      teams,
    ],
  );

  const globalFilterFn = React.useCallback(
    (
      row: { original: SerializedTeam },
      _columnId: string,
      filterValue: string,
    ) => {
      const search = filterValue.toLowerCase().trim();
      if (!search) return true;
      const team = row.original;
      if (team.name?.toLowerCase().includes(search)) return true;
      if (team.color?.toLowerCase().includes(search)) return true;
      if (representativeLabel(team).toLowerCase().includes(search)) return true;
      return false;
    },
    [],
  );

  const table = useReactTable({
    columns,
    data: teams,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    state: {
      globalFilter,
      sorting,
    },
  });

  const isFiltered = Boolean(globalFilter.trim());

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: Search, Add Team action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[14rem] sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              className="pl-8"
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Filter teams by name, color, role..."
              value={globalFilter}
            />
          </div>

          {isFiltered && (
            <Button
              className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setGlobalFilter("")}
              size="sm"
              type="button"
              variant="ghost"
            >
              <FilterX className="size-3.5" />
              Reset filter
            </Button>
          )}
        </div>

        <Button onClick={onAddClick} type="button">
          <Plus className="size-4" />
          Add Team
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
                  {teams.length === 0 ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Users aria-hidden />
                        </EmptyMedia>
                        <EmptyTitle>
                          You haven&apos;t created any Teams yet.
                        </EmptyTitle>
                        <EmptyDescription>
                          An Auction needs at least two Teams before it can
                          start. Click &quot;Add Team&quot; to create one.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Search aria-hidden />
                        </EmptyMedia>
                        <EmptyTitle>No teams match your filter.</EmptyTitle>
                        <EmptyDescription>
                          Try adjusting your search query.
                        </EmptyDescription>
                      </EmptyHeader>
                      <div className="mt-2 flex justify-center">
                        <Button
                          onClick={() => setGlobalFilter("")}
                          size="sm"
                          variant="outline"
                        >
                          Clear filter
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
      {teams.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>
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
            teams
            {isFiltered && ` (filtered from ${teams.length} total)`}
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
