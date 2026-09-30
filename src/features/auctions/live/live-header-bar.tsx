"use client";

import Link from "next/link";
import { memo } from "react";
import {
  AlertTriangle,
  Settings2,
  ShieldCheck,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "cn";

import { Switch } from "@/components/ui/switch";
import type { CloseMode, LiveStatus, LiveTierProgress } from "@/domain/live";
import { formatCredits } from "./live-theme";

interface LiveHeaderBarProps {
  activeTier: LiveTierProgress | undefined;
  auctionId: string;
  closeMode: CloseMode;
  connectionStale: boolean;
  eligiblePlayerCount: number;
  lifecycle: LiveStatus;
  onToggleSound: (enabled: boolean) => void;
  revision: number;
  role: "organizer" | "representative";
  salesCount: number;
  soundEnabled: boolean;
  teamsCount: number;
  timedCloseSeconds: number | null;
  totalSpentCredits: number;
}

export const LiveHeaderBar = memo(function LiveHeaderBar({
  activeTier,
  auctionId,
  closeMode,
  connectionStale,
  eligiblePlayerCount,
  lifecycle,
  onToggleSound,
  revision,
  role,
  salesCount,
  soundEnabled,
  teamsCount,
  timedCloseSeconds,
  totalSpentCredits,
}: LiveHeaderBarProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card/90 px-4 py-3.5 shadow-md backdrop-blur-md sm:px-6">
      {/* Left: Branding, Title, and Lifecycle Status */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-neon/40 bg-neon/15 text-neon shadow-sm">
          <Trophy className="size-5" />
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-base font-bold tracking-tight text-foreground sm:text-lg">
              {lifecycle === "paused" ? "Paused" : "Live Auction"}
            </h1>
            <span className="py-0.2 rounded-full bg-muted/70 px-2 font-mono text-[10px] text-muted-foreground tabular-nums">
              rev {revision}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {/* Live / Paused Beacon */}
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="relative flex size-2">
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                    lifecycle === "live" ? "bg-emerald-400" : "bg-amber-400",
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex size-2 rounded-full",
                    lifecycle === "live" ? "bg-emerald-500" : "bg-amber-500",
                  )}
                />
              </span>
              <span
                className={cn(
                  "text-[11px] font-bold tracking-wider uppercase",
                  lifecycle === "live" ? "text-emerald-400" : "text-amber-400",
                )}
              >
                {lifecycle === "live" ? "Live" : "Paused"}
              </span>
            </span>

            <span>·</span>
            <span>
              {closeMode === "timed"
                ? `Timed Close (${timedCloseSeconds ?? 30}s)`
                : "Manual Close"}
            </span>

            {/* Connection Indicator */}
            <span>·</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px]",
                connectionStale
                  ? "font-bold text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {connectionStale ? (
                <>
                  <AlertTriangle className="size-3" /> Reconnecting…
                </>
              ) : (
                <>
                  <ShieldCheck className="size-3 text-emerald-400" /> Connected
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Middle/Right: Live Stats Strip */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        {/* Active Tier */}
        {activeTier && (
          <div className="flex flex-col text-left">
            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Active Tier
            </span>
            <span className="font-display text-xs font-bold text-neon">
              {activeTier.label} ({activeTier.offeredCount}/
              {activeTier.biddableCount})
            </span>
          </div>
        )}

        {/* Players In Queue */}
        <div className="flex flex-col text-left">
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            In Queue
          </span>
          <span className="font-mono text-xs font-bold text-foreground">
            {eligiblePlayerCount} remaining
          </span>
        </div>

        {/* Sales Done */}
        <div className="flex flex-col text-left">
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Acquisitions
          </span>
          <span className="font-mono text-xs font-bold text-foreground">
            {salesCount} sold ({formatCredits(totalSpentCredits)} cr)
          </span>
        </div>

        {/* Teams Count */}
        <div className="flex flex-col text-left">
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Teams
          </span>
          <span className="font-mono text-xs font-bold text-foreground">
            {teamsCount} active
          </span>
        </div>

        {/* Sound Toggle */}
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-1.5 text-xs">
          {soundEnabled ? (
            <Volume2 className="size-4 text-primary" />
          ) : (
            <VolumeX className="size-4 text-muted-foreground" />
          )}
          <label
            className="cursor-pointer text-[11px] font-medium select-none"
            htmlFor="live-sounds"
          >
            Live sounds (off by default)
          </label>
          <Switch
            aria-label="Live sounds (off by default)"
            checked={soundEnabled}
            id="live-sounds"
            onCheckedChange={onToggleSound}
          />
        </div>

        {/* Manage Auction Link (if organizer and paused) */}
        {role === "organizer" && lifecycle === "paused" && (
          <Link
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
            href={`/app/auctions/${auctionId}/manage`}
          >
            <Settings2 className="size-3.5" />
            <span>Manage Changes</span>
          </Link>
        )}
      </div>
    </header>
  );
});
