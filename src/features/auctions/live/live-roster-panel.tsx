"use client";

import { memo } from "react";
import { Crown, Users } from "lucide-react";
import { cn } from "cn";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LivePlayerDetails, LiveTeamPublicState } from "@/domain/live";
import { loadLivePlayerDetailsAction } from "./live-actions";
import { getTeamColor } from "./live-theme";

interface LiveRosterPanelProps {
  auctionId: string;
  currentBid: null | { amount: number; teamId: string };
  onPlayerDetails: (details: LivePlayerDetails) => void;
  teams: LiveTeamPublicState[];
  youTeamId: null | string;
}

export const LiveRosterPanel = memo(function LiveRosterPanel({
  auctionId,
  currentBid,
  onPlayerDetails,
  teams,
  youTeamId,
}: LiveRosterPanelProps) {
  return (
    <div className="flex flex-col gap-4 lg:col-span-12 xl:col-span-3">
      <Card className="border-border/80 bg-card/90 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle
              aria-level={2}
              role="heading"
              className="flex items-center gap-2 text-lg font-bold"
            >
              <Users className="size-4 text-neon" />
              Teams
            </CardTitle>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {teams.length} teams
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {teams.map((team) => {
              const color = getTeamColor(team);
              const isLeader = team.id === currentBid?.teamId;
              const isYourTeam = team.id === youTeamId;
              const players = team.players ?? [];

              return (
                <li
                  key={team.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border p-3 transition-all",
                    isLeader
                      ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)] ring-1 ring-emerald-500/30"
                      : isYourTeam
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/50 bg-background/50",
                  )}
                  style={{
                    borderLeftColor: color,
                    borderLeftWidth: "4px",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold"
                        style={{
                          backgroundColor: `${color}25`,
                          color,
                        }}
                      >
                        {(team.name ?? "T").charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate text-xs font-semibold">
                        {team.name ?? "Unnamed"}
                        {team.isLeader ? " (leading)" : ""}
                      </span>
                    </div>

                    {team.isLeader && (
                      <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-emerald-400">
                        <Crown className="size-3" />
                        Leading
                      </span>
                    )}
                  </div>

                  {/* Text exact match for test: "Roster X · Spent Y · Remaining Z" */}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Roster {team.rosterCount} · Spent {team.spentCredits} ·
                    Remaining {team.remainingBudget}
                  </span>

                  {/* Visual Acquired Players Chips (User Request #4) */}
                  {players.length > 0 && (
                    <div className="flex flex-wrap gap-1 border-t border-border/40 pt-1">
                      {players.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={async () => {
                            const details = await loadLivePlayerDetailsAction(
                              auctionId,
                              p.id,
                            );
                            if (details) onPlayerDetails(details);
                          }}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-muted/70"
                          title="Click to view player details"
                        >
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span className="max-w-[100px] truncate">
                            {p.name}
                          </span>
                          {p.amount > 0 ? (
                            <span className="font-mono text-muted-foreground">
                              {p.amount}cr
                            </span>
                          ) : (
                            <span className="text-[9px] text-primary">Rep</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
});
