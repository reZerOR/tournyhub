import { describe, expect, it } from "vitest";
import {
  createTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import type { LivePlayerSummary } from "@/domain/live";
import {
  livePlayerColumns,
  summarizePlayers,
} from "@/features/auctions/live/live-player-directory";

const players: LivePlayerSummary[] = [
  "waiting",
  "active",
  "sold",
  "forced",
  "preassigned",
  "unsold",
  "final_unsold",
].map((status, index) => ({
  id: String(index),
  displayName: `Player ${index}`,
  tierId: index < 4 ? "gold" : null,
  status: status as LivePlayerSummary["status"],
  teamId: [2, 3, 4].includes(index) ? "red" : null,
  amount: index === 2 ? 1000 : index === 3 ? 90 : null,
}));

function directory({
  filters = [],
  sorting = [],
  data = players,
  pageIndex = 0,
  pageSize = 50,
}: {
  filters?: ColumnFiltersState;
  sorting?: SortingState;
  data?: LivePlayerSummary[];
  pageIndex?: number;
  pageSize?: number;
} = {}) {
  return createTable({
    data,
    columns: livePlayerColumns(
      new Map([["gold", "Gold"]]),
      new Map([["red", "Reds"]]),
    ),
    state: {
      columnFilters: filters,
      sorting,
      pagination: { pageIndex, pageSize },
    },
    getRowId: (player) => player.id,
    onStateChange: () => {},
    renderFallbackValue: null,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
}

describe("TanStack live player directory", () => {
  it("keeps acquired, preassigned, remaining, and Final Unsold counts distinct", () => {
    expect(summarizePlayers(players)).toEqual({
      total: 7,
      sold: 2,
      remaining: 3,
      preassigned: 1,
      finalUnsold: 1,
    });
  });
  it("includes active bidding and reofferable Unsold Players in remaining", () => {
    expect(
      directory({ filters: [{ id: "status", value: "remaining" }] })
        .getRowModel()
        .rows.map((row) => row.original.status),
    ).toEqual(["waiting", "active", "unsold"]);
  });
  it("combines tier, status, team, and case-insensitive name search", () => {
    const table = directory({
      filters: [
        { id: "tierId", value: "gold" },
        { id: "status", value: "sold" },
        { id: "teamId", value: "red" },
        { id: "displayName", value: " PLAYER 2 " },
      ],
    });
    expect(table.getRowModel().rows.map((row) => row.id)).toEqual(["2"]);
    expect(
      directory({
        filters: [{ id: "teamId", value: "unassigned" }],
      }).getRowModel().rows,
    ).toHaveLength(4);
    expect(
      directory({
        filters: [{ id: "tierId", value: "unassigned" }],
      }).getRowModel().rows,
    ).toHaveLength(3);
  });
  it("sorts prices numerically with unpriced Players last in both directions", () => {
    for (const desc of [false, true]) {
      const rows = directory({
        sorting: [{ id: "amount", desc }],
      }).getRowModel().rows;
      expect(rows.slice(0, 2).map((row) => row.original.amount)).toEqual(
        desc ? [1000, 90] : [90, 1000],
      );
      expect(rows.slice(2).every((row) => row.original.amount === null)).toBe(
        true,
      );
    }
  });
  it("paginates filtered results while keeping duplicate names distinct", () => {
    const duplicates = players.map((player) => ({
      ...player,
      displayName: "Alex",
    }));
    const table = directory({ data: duplicates, pageSize: 2, pageIndex: 1 });
    expect(table.getRowModel().rows.map((row) => row.id)).toEqual(["2", "3"]);
    expect(table.getPageCount()).toBe(4);
  });
  it("recomputes the same filters when live data changes", () => {
    const table = directory({
      filters: [{ id: "status", value: "remaining" }],
    });
    expect(table.getRowModel().rows).toHaveLength(3);
    table.setOptions((previous) => ({
      ...previous,
      data: players.map((player) =>
        player.id === "1"
          ? { ...player, status: "sold", teamId: "red", amount: 150 }
          : player,
      ),
    }));
    expect(table.getRowModel().rows.map((row) => row.id)).toEqual(["0", "5"]);
  });
});
