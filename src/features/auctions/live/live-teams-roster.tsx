"use client";

import { Crown, Users } from "lucide-react";
import { cn } from "cn";

import type { LiveTeamPublicState } from "@/domain/live";
import { formatCredits, getTeamColor } from "./live-theme";

interface LiveTeamsRosterProps {
  currentBid: null | { amount: number; teamId: string };
  maxRoster: number;
  onSelectPlayerId?: (id: string) => void;
  teams: LiveTeamPublicState[];
  youTeamId: null | string;
}

export function LiveTeamsRoster({
  currentBid,
  maxRoster,
  onSelectPlayerId,
  teams,
  youTeamId,
}: LiveTeamsRosterProps) {
  // Sort teams: Your team first (if representative), then leading team, then position
  const sortedTeams = [...teams].sort((a, b) => {
    if (a.id === youTeamId) return -1;
    if (b.id === youTeamId) return 1;
    if (a.id === currentBid?.teamId) return -1;
    if (b.id === currentBid?.teamId) return 1;
    return a.position - b.position;
  });

  return (
    <div className="flex h-[600px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-lg backdrop-blur-md xl:h-[660px]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-muted/30 p-3.5">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-neon" />
          <span className="font-display text-xs font-bold tracking-wider text-foreground uppercase">
            Teams & Rosters
          </span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {teams.length} Teams Participating
        </span>
      </div>

      {/* Scrollable Team Cards List */}
      <div className="flex min-h-0 flex-1 scrollbar-thin flex-col gap-3 overflow-y-auto p-3.5">
        {sortedTeams.map((team) => {
          const color = getTeamColor(team);
          const isLeader = team.id === currentBid?.teamId;
          const isYourTeam = team.id === youTeamId;
          const players = team.players ?? [];
          const effectiveMaxRoster = Math.max(maxRoster, players.length);
          const emptySlotsCount = Math.max(
            0,
            effectiveMaxRoster - players.length,
          );
          const totalBudget = team.remainingBudget + team.spentCredits;
          const budgetRemainingPct =
            totalBudget > 0
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    Math.round((team.remainingBudget / totalBudget) * 100),
                  ),
                )
              : 0;

          return (
            <div
              className={cn(
                "relative flex flex-col overflow-hidden rounded-xl border bg-background/50 transition-all duration-200",
                isLeader
                  ? "border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30"
                  : isYourTeam
                    ? "border-primary/50 shadow-[0_0_15px_rgba(var(--primary),0.1)] ring-1 ring-primary/20"
                    : "border-border/50 hover:border-border/80",
              )}
              key={team.id}
            >
              {/* Top Accent Color Bar */}
              <div
                className="h-1.5 w-full"
                style={{ backgroundColor: color }}
              />

              <div className="flex flex-col gap-2.5 p-3">
                {/* Team Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg font-display text-xs font-bold shadow-sm"
                      style={{
                        backgroundColor: `${color}25`,
                        borderColor: `${color}60`,
                        borderWidth: "1.5px",
                        color,
                      }}
                    >
                      {(team.name ?? `T${team.position + 1}`)
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div className="flex min-w-0 flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-bold text-foreground">
                          {team.name ?? `Team ${team.position + 1}`}
                        </span>
                        {isYourTeam && (
                          <span className="py-0.2 rounded border border-primary/30 bg-primary/20 px-1.5 text-[9px] font-bold text-primary">
                            YOU
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        Roster:{" "}
                        <span className="font-semibold text-foreground">
                          {players.length}
                        </span>
                        /{effectiveMaxRoster}
                      </span>
                    </div>
                  </div>

                  {isLeader && (
                    <span className="inline-flex shrink-0 animate-pulse items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      <Crown className="size-3 text-emerald-400" />
                      LEADING
                    </span>
                  )}
                </div>

                {/* Budget Gauge */}
                <div className="flex flex-col gap-1 rounded-lg border border-border/30 bg-muted/20 p-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">
                      Remaining Budget
                    </span>
                    <span className="font-mono font-bold text-foreground tabular-nums">
                      {formatCredits(team.remainingBudget)}{" "}
                      <span className="font-sans text-[9px] font-normal text-muted-foreground">
                        cr
                      </span>
                    </span>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        backgroundColor: color,
                        width: `${budgetRemainingPct}%`,
                      }}
                    />
                  </div>

                  <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                    <span>Spent: {formatCredits(team.spentCredits)} cr</span>
                    <span>Total: {formatCredits(totalBudget)} cr</span>
                  </div>
                </div>

                {/* Visual Acquired Squad */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    <span>Acquired Players</span>
                    <span className="font-mono text-foreground tabular-nums">
                      {players.length}
                    </span>
                  </div>

                  {players.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {players.map((p) => (
                        <div
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/70 px-2 py-1 text-xs transition-colors hover:bg-background",
                            onSelectPlayerId &&
                              "cursor-pointer hover:border-border/80 hover:bg-muted/40",
                          )}
                          key={p.id}
                          onClick={() => onSelectPlayerId?.(p.id)}
                          title={
                            onSelectPlayerId
                              ? "Click to view player details"
                              : undefined
                          }
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span
                              className="size-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            <span className="truncate text-[11px] font-medium text-foreground">
                              {p.name}
                            </span>
                            {p.isRepresentative && (
                              <span className="rounded border border-primary/20 bg-primary/10 px-1 py-0 text-[9px] font-medium text-primary">
                                Rep
                              </span>
                            )}
                            {p.source === "forced" && (
                              <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1 py-0 text-[9px] font-medium text-amber-400">
                                Forced
                              </span>
                            )}
                            {p.source === "direct" && (
                              <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1 py-0 text-[9px] font-medium text-indigo-400">
                                Direct
                              </span>
                            )}
                          </div>

                          <div className="shrink-0 font-mono text-[11px]">
                            {p.amount > 0 ? (
                              <span className="font-semibold text-foreground">
                                {formatCredits(p.amount)}{" "}
                                <span className="font-sans text-[9px] font-normal text-muted-foreground">
                                  cr
                                </span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">
                                Preassigned
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/40 p-2 text-center text-[11px] text-muted-foreground/70 italic">
                      No players acquired yet
                    </div>
                  )}

                  {/* Empty Squad Slots */}
                  {emptySlotsCount > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {Array.from({ length: Math.min(emptySlotsCount, 3) }).map(
                        (_, i) => (
                          <div
                            className="flex h-5 min-w-[65px] flex-1 items-center justify-center rounded border border-dashed border-border/50 bg-muted/10 font-mono text-[9px] text-muted-foreground/60 select-none"
                            key={i}
                          >
                            Slot {players.length + i + 1} Open
                          </div>
                        ),
                      )}
                      {emptySlotsCount > 3 && (
                        <span className="self-center px-1 font-mono text-[9px] text-muted-foreground/60">
                          +{emptySlotsCount - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
