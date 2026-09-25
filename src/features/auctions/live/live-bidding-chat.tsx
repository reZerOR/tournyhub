"use client";

import { memo, useEffect, useRef, useState } from "react";
import { ArrowDown, Flame, Gavel, Sparkles, Trophy, Zap } from "lucide-react";
import { cn } from "cn";

import type {
  LiveActivePlayer,
  LiveBidItem,
  LiveSale,
  LiveTeamPublicState,
} from "@/domain/live";
import { formatCredits, formatTime, getTeamColor } from "./live-theme";
import { LiveCountdown } from "./live-countdown";

interface LiveBiddingChatProps {
  activePlayer: LiveActivePlayer | null;
  bids: LiveBidItem[];
  clockOffsetMs: number;
  currentBid: null | { amount: number; teamId: string };
  finalizing: boolean;
  lastSale: LiveSale | null;
  nextBidAmount?: number | null;
  teams: LiveTeamPublicState[];
}

export const LiveBiddingChat = memo(function LiveBiddingChat({
  activePlayer,
  bids,
  clockOffsetMs,
  currentBid,
  finalizing,
  lastSale,
  nextBidAmount,
  teams,
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
  }, [
    bids.length,
    isScrolledUp,
    activePlayer?.presentationId,
    lastSale?.saleId,
  ]);

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
    <div className="relative flex h-[600px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-lg backdrop-blur-md xl:h-[660px]">
      {/* Top Header: Sticky Status & Current Leader */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 bg-muted/30 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="font-display text-xs font-bold tracking-wider text-foreground uppercase">
              Live Bidding Stream
            </span>
          </div>

          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {bids.length} bid{bids.length === 1 ? "" : "s"} this lot
          </span>
        </div>

        {/* Current Lot & Leader Pill */}
        {activePlayer ? (
          <div
            className="flex items-center justify-between gap-3 rounded-xl border p-2.5 transition-all"
            style={{
              backgroundColor: leadingTeam
                ? `${leadingTeamColor}12`
                : "rgba(255,255,255,0.02)",
              borderColor: leadingTeam
                ? `${leadingTeamColor}40`
                : "var(--border)",
              boxShadow: leadingTeam
                ? `0 0 20px ${leadingTeamColor}15`
                : "none",
            }}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              {leadingTeam ? (
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg font-display text-xs font-bold"
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
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Gavel className="size-4" />
                </div>
              )}

              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    {leadingTeam ? "Leading Bid" : "Starting Price"}
                  </span>
                  {activePlayer.tierLabel && (
                    <span className="py-0.2 rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                      {activePlayer.tierLabel}
                    </span>
                  )}
                </div>
                <span className="truncate text-xs font-semibold text-foreground">
                  {leadingTeam?.name ?? "No bids yet"}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end">
              <span className="font-mono text-base font-bold text-foreground tabular-nums">
                {formatCredits(
                  currentBid?.amount ?? activePlayer.startingPrice,
                )}{" "}
                <span className="font-sans text-xs font-normal text-muted-foreground">
                  cr
                </span>
              </span>

              <LiveCountdown
                closeDeadline={activePlayer.closeDeadline}
                clockOffsetMs={clockOffsetMs}
                compact
                fallbackLabel={currentBid ? "Leading" : "Opening"}
                finalizing={finalizing}
                warningDeadline={activePlayer.warningDeadline}
              />
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
        className="flex min-h-0 flex-1 scrollbar-thin flex-col gap-2.5 overflow-y-auto p-4"
        onScroll={handleScroll}
        ref={scrollRef}
      >
        {/* Lot Open Announcement */}
        {activePlayer && (
          <div className="my-1 flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
            <Flame className="size-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{activePlayer.displayName}</span>{" "}
              is open for bids at Starting Price{" "}
              <span className="font-mono font-bold">
                {activePlayer.startingPrice} cr
              </span>
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

            const prevAmount =
              index === 0
                ? (activePlayer?.startingPrice ?? 0)
                : bids[index - 1].amount;
            const jumpDelta = bid.amount - prevAmount;
            const inferredIncrement =
              currentBid && nextBidAmount
                ? nextBidAmount - currentBid.amount
                : null;
            const isJumpBid =
              index === 0
                ? activePlayer !== null &&
                  bid.amount > activePlayer.startingPrice
                : inferredIncrement !== null
                  ? jumpDelta > inferredIncrement
                  : false;

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
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg font-display text-xs font-bold shadow-sm select-none"
                  style={{
                    backgroundColor: `${teamColor}25`,
                    borderColor: `${teamColor}60`,
                    borderWidth: "1.5px",
                    color: teamColor,
                  }}
                >
                  {teamName.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="truncate text-xs font-bold"
                      style={{ color: teamColor }}
                    >
                      {teamName}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                      {formatTime(bid.serverTime)}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      Bid placed:
                    </span>
                    <span className="font-mono text-sm font-bold text-foreground tabular-nums">
                      {bid.amount.toLocaleString()}{" "}
                      <span className="font-sans text-[10px] font-normal text-muted-foreground">
                        cr
                      </span>
                    </span>
                    {isJumpBid && (
                      <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                        <Zap className="size-3" />
                        JUMP (+{jumpDelta.toLocaleString()})
                      </span>
                    )}
                  </div>
                </div>

                {isLeading && (
                  <span className="inline-flex shrink-0 animate-pulse items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    LEADING
                  </span>
                )}
              </div>
            );
          })
        ) : activePlayer ? (
          <div className="my-auto flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted/40">
              <Gavel className="size-5 text-muted-foreground/70" />
            </div>
            <p className="text-xs font-medium">
              No bids placed for this player yet.
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              Opening bid starts at{" "}
              <span className="font-mono font-semibold text-foreground">
                {activePlayer.startingPrice} cr
              </span>
            </p>
          </div>
        ) : lastSale ? (
          <div className="my-auto flex flex-col items-center justify-center gap-3 py-10 text-center text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
              <Trophy className="size-6" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">
                Previous Lot Result
              </span>
              <span className="text-sm font-bold text-foreground">
                {lastSale.playerDisplayName} sold for {lastSale.amount} cr
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground/70">
              Select or offer the next player to open bidding
            </span>
          </div>
        ) : (
          <div className="my-auto flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
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
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-md transition-transform hover:scale-105 active:scale-95"
          onClick={scrollToBottom}
          type="button"
        >
          <ArrowDown className="size-3.5" />
          <span>Jump to Latest Bid</span>
        </button>
      )}
    </div>
  );
});
