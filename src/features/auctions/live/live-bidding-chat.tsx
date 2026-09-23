"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, Flame, Gavel, Sparkles, Trophy } from "lucide-react";
import { cn } from "cn";

import type {
  LiveActivePlayer,
  LiveBidItem,
  LiveSale,
  LiveTeamPublicState,
} from "@/domain/live";
import { formatCredits, formatTime, getTeamColor } from "./live-theme";

interface LiveBiddingChatProps {
  activePlayer: LiveActivePlayer | null;
  bids: LiveBidItem[];
  closeRemaining: number | null;
  currentBid: null | { amount: number; teamId: string };
  finalizing: boolean;
  lastSale: LiveSale | null;
  teams: LiveTeamPublicState[];
  warningRemaining: number | null;
}

export function LiveBiddingChat({
  activePlayer,
  bids,
  closeRemaining,
  currentBid,
  finalizing,
  lastSale,
  teams,
  warningRemaining,
}: LiveBiddingChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  // Auto-scroll to bottom on new bids
  useEffect(() => {
    if (!isScrolledUp && scrollRef.current) {
      scrollRef.current.scrollTo({
        behavior: "smooth",
        top: scrollRef.current.scrollHeight,
      });
    }
  }, [bids.length, isScrolledUp, activePlayer?.presentationId, lastSale?.saleId]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { clientHeight, scrollHeight, scrollTop } = scrollRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsScrolledUp(distanceFromBottom > 80);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        behavior: "smooth",
        top: scrollRef.current.scrollHeight,
      });
      setIsScrolledUp(false);
    }
  };

  const leadingTeam = currentBid
    ? teams.find((t) => t.id === currentBid.teamId)
    : null;
  const leadingTeamColor = leadingTeam ? getTeamColor(leadingTeam) : "#10b981";

  return (
    <div className="relative flex flex-col h-[600px] xl:h-[660px] rounded-2xl border border-border/70 bg-card/80 backdrop-blur-md overflow-hidden shadow-lg">
      {/* Top Header: Sticky Status & Current Leader */}
      <div className="border-b border-border/60 bg-muted/30 p-3.5 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-2.5 bg-emerald-500" />
            </span>
            <span className="font-display text-xs font-bold tracking-wider uppercase text-foreground">
              Live Bidding Stream
            </span>
          </div>

          <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
            {bids.length} bid{bids.length === 1 ? "" : "s"} this lot
          </span>
        </div>

        {/* Current Lot & Leader Pill */}
        {activePlayer ? (
          <div
            className="flex items-center justify-between gap-3 rounded-xl border p-2.5 transition-all"
            style={{
              backgroundColor: leadingTeam ? `${leadingTeamColor}12` : "rgba(255,255,255,0.02)",
              borderColor: leadingTeam ? `${leadingTeamColor}40` : "var(--border)",
              boxShadow: leadingTeam ? `0 0 20px ${leadingTeamColor}15` : "none",
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {leadingTeam ? (
                <div
                  className="flex size-8 items-center justify-center rounded-lg text-xs font-bold font-display shrink-0"
                  style={{
                    backgroundColor: `${leadingTeamColor}25`,
                    borderColor: `${leadingTeamColor}60`,
                    borderWidth: "1.5px",
                    color: leadingTeamColor,
                  }}
                >
                  {(leadingTeam.name ?? "T").charAt(0).toUpperCase()}
                </div>
              ) : (
                <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                  <Gavel className="size-4" />
                </div>
              )}

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {leadingTeam ? "Leading Bid" : "Starting Price"}
                  </span>
                  {activePlayer.tierLabel && (
                    <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground">
                      {activePlayer.tierLabel}
                    </span>
                  )}
                </div>
                <span className="font-semibold text-xs truncate text-foreground">
                  {leadingTeam?.name ?? "No bids yet"}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0">
              <span className="font-mono text-base font-bold tabular-nums text-foreground">
                {formatCredits(currentBid?.amount ?? activePlayer.startingPrice)}{" "}
                <span className="text-xs font-sans font-normal text-muted-foreground">cr</span>
              </span>

              {finalizing ? (
                <span className="text-[10px] font-semibold text-emerald-400 animate-pulse">
                  Finalizing Sale…
                </span>
              ) : warningRemaining !== null && warningRemaining > 0 ? (
                <span className="text-[10px] font-bold text-amber-400 animate-pulse">
                  Closing in {warningRemaining.toFixed(1)}s
                </span>
              ) : closeRemaining !== null && closeRemaining > 0 && closeRemaining <= 5 ? (
                <span className="text-[10px] font-bold text-amber-400 animate-pulse">
                  Anti-Snipe: {closeRemaining.toFixed(1)}s
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  {currentBid ? "Leading" : "Opening"}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/10 p-2.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-neon" />
            <span>Between lots · Ready for next player selection</span>
          </div>
        )}
      </div>

      {/* Chat / Bids Feed */}
      <div
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 min-h-0 scrollbar-thin"
        onScroll={handleScroll}
        ref={scrollRef}
      >
        {/* Lot Open Announcement */}
        {activePlayer && (
          <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary my-1">
            <Flame className="size-3.5 shrink-0 text-primary" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold">{activePlayer.displayName}</span>{" "}
              is open for bids at Starting Price{" "}
              <span className="font-mono font-bold">{activePlayer.startingPrice} cr</span>
              {activePlayer.tierLabel ? ` (${activePlayer.tierLabel})` : ""}
            </div>
          </div>
        )}

        {/* Bids Stream */}
        {bids.length > 0 ? (
          bids.map((bid, index) => {
            const team = teams.find((t) => t.id === bid.teamId);
            const teamColor = team ? getTeamColor(team) : "#3b82f6";
            const teamName = team?.name ?? "Team";
            const isLeading = index === bids.length - 1;

            return (
              <div
                className={cn(
                  "relative flex items-start gap-3 rounded-xl p-3 transition-all duration-200",
                  isLeading
                    ? "border border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.12)] ring-1 ring-emerald-500/30"
                    : "border border-border/50 bg-background/50 hover:bg-background/80",
                )}
                key={bid.id}
                style={{
                  borderLeftColor: teamColor,
                  borderLeftWidth: "4px",
                }}
              >
                {/* Team Avatar with custom team color */}
                <div
                  className="flex size-8 items-center justify-center rounded-lg font-display text-xs font-bold shrink-0 select-none shadow-sm"
                  style={{
                    backgroundColor: `${teamColor}25`,
                    borderColor: `${teamColor}60`,
                    borderWidth: "1.5px",
                    color: teamColor,
                  }}
                >
                  {teamName.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="font-bold text-xs truncate"
                      style={{ color: teamColor }}
                    >
                      {teamName}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                      {formatTime(bid.serverTime)}
                    </span>
                  </div>

                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-xs text-muted-foreground">Bid placed:</span>
                    <span className="text-sm font-bold font-mono text-foreground tabular-nums">
                      {bid.amount.toLocaleString()}{" "}
                      <span className="text-[10px] font-sans font-normal text-muted-foreground">cr</span>
                    </span>
                  </div>
                </div>

                {isLeading && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/40 animate-pulse">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    LEADING
                  </span>
                )}
              </div>
            );
          })
        ) : activePlayer ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2 text-muted-foreground my-auto">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted/40">
              <Gavel className="size-5 text-muted-foreground/70" />
            </div>
            <p className="text-xs font-medium">No bids placed for this player yet.</p>
            <p className="text-[11px] text-muted-foreground/70">
              Opening bid starts at{" "}
              <span className="font-mono font-semibold text-foreground">
                {activePlayer.startingPrice} cr
              </span>
            </p>
          </div>
        ) : lastSale ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3 text-muted-foreground my-auto">
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Trophy className="size-6" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Previous Lot Result</span>
              <span className="text-sm font-bold text-foreground">
                {lastSale.playerDisplayName} sold for {lastSale.amount} cr
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground/70">
              Select or offer the next player to open bidding
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-2 text-muted-foreground my-auto">
            <Gavel className="size-6 text-muted-foreground/50" />
            <p className="text-xs font-medium">Ready to start bidding</p>
            <p className="text-[11px] text-muted-foreground/70">
              Offer a player to open the live bidding arena
            </p>
          </div>
        )}
      </div>

      {/* Floating Jump to Latest Button */}
      {isScrolledUp && (
        <button
          className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-md transition-transform hover:scale-105 active:scale-95"
          onClick={scrollToBottom}
          type="button"
        >
          <ArrowDown className="size-3.5" />
          <span>Jump to Latest Bid</span>
        </button>
      )}
    </div>
  );
}
