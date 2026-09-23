import type { LivePlayerSummary } from "@/domain/live";
import type { ColumnDef } from "@tanstack/react-table";

export const PLAYER_STATUS_LABELS = {
  waiting: "Waiting",
  active: "Active bidding",
  sold: "Sold",
  forced: "Forced Assignment",
  preassigned: "Player Representative",
  unsold: "Unsold Pool",
  final_unsold: "Final Unsold",
} satisfies Record<LivePlayerSummary["status"], string>;

export type PlayerStatusFilter =
  "all" | "remaining" | LivePlayerSummary["status"];

export function isRemainingPlayer(player: LivePlayerSummary): boolean {
  return (
    player.status === "waiting" ||
    player.status === "active" ||
    player.status === "unsold"
  );
}

export function summarizePlayers(players: readonly LivePlayerSummary[]) {
  return {
    total: players.length,
    sold: players.filter(
      (player) => player.status === "sold" || player.status === "forced",
    ).length,
    remaining: players.filter(isRemainingPlayer).length,
    preassigned: players.filter((player) => player.status === "preassigned")
      .length,
    finalUnsold: players.filter((player) => player.status === "final_unsold")
      .length,
  };
}

/** Accessors sort by displayed labels; filters match stable IDs, not names. */
export function livePlayerColumns(
  tierLabels: ReadonlyMap<string, string>,
  teamLabels: ReadonlyMap<string, string>,
): ColumnDef<LivePlayerSummary>[] {
  return [
    {
      accessorKey: "displayName",
      header: "Player",
      filterFn: (row, _id, value: string) =>
        row.original.displayName
          .toLocaleLowerCase()
          .includes(value.trim().toLocaleLowerCase()),
    },
    {
      id: "tierId",
      header: "Tier",
      accessorFn: (player) =>
        tierLabels.get(player.tierId ?? "") ?? "Unassigned",
      filterFn: (row, _id, value) =>
        (row.original.tierId ?? "unassigned") === value,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (player) => PLAYER_STATUS_LABELS[player.status],
      filterFn: (row, _id, value: PlayerStatusFilter) =>
        value === "remaining"
          ? isRemainingPlayer(row.original)
          : row.original.status === value,
    },
    {
      id: "teamId",
      header: "Team",
      accessorFn: (player) =>
        teamLabels.get(player.teamId ?? "") ?? "Not assigned",
      filterFn: (row, _id, value) =>
        (row.original.teamId ?? "unassigned") === value,
    },
    {
      id: "amount",
      header: "Sale price",
      accessorFn: (player) => player.amount ?? undefined,
      sortUndefined: "last",
    },
  ];
}
