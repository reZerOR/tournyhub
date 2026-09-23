"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Crown,
  Flame,
  Gavel,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  Sparkles,
  Trophy,
  User,
} from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type {
  CloseMode,
  LiveActivePlayer,
  LiveCallerPrivateState,
  LiveSale,
  LiveStatus,
  LiveTeamPublicState,
} from "@/domain/live";
import { formatCredits, getTeamColor } from "./live-theme";
import { LivePlayerDetailsDialog } from "./live-player-details-dialog";

interface LiveStageSpotlightProps {
  activePlayer: LiveActivePlayer | null;
  canBid: boolean;
  closeMode: CloseMode;
  closeRemaining: number | null;
  connectionStale: boolean;
  currentBid: null | { amount: number; teamId: string };
  eligiblePlayers: {
    displayName: string;
    id: string;
    startingPrice: number;
    tierId: null | string;
  }[] | null;
  finalizing: boolean;
  lastSale: LiveSale | null;
  lifecycle: LiveStatus;
  nextBid: number | null;
  onCancelClose: () => void;
  onFinalizeNow: () => void;
  onOfferPlayer: () => void;
  onPauseResume: () => void;
  onPlaceBid: () => void;
  onRandomPlayer: () => void;
  onResolveRemaining?: (pricing: "average" | "base") => void;
  onReturnPlayer: () => void;
  onReturnReasonChange: (reason: string) => void;
  onSelectPlayerIdChange: (id: string) => void;
  onStartClose: () => void;
  pending: boolean;
  remainingTierPlayer?: {
    displayName: string;
    id: string;
    startingPrice: number;
  } | null;
  returnReason: string;
  role: "organizer" | "representative";
  selectedPlayerId: string;
  showRemainingResolution?: boolean;
  soleEligibleTeam?: LiveTeamPublicState | null;
  teams: LiveTeamPublicState[];
  tierAvgPrice?: number;
  tierBasePrice?: number;
  timedCloseDuration: number | null;
  warningRemaining: number | null;
  you: LiveCallerPrivateState;
}

export function LiveStageSpotlight({
  activePlayer,
  canBid,
  closeMode,
  closeRemaining,
  connectionStale,
  currentBid,
  eligiblePlayers,
  finalizing,
  lastSale,
  lifecycle,
  nextBid,
  onCancelClose,
  onFinalizeNow,
  onOfferPlayer,
  onPauseResume,
  onPlaceBid,
  onRandomPlayer,
  onResolveRemaining,
  onReturnPlayer,
  onReturnReasonChange,
  onSelectPlayerIdChange,
  onStartClose,
  pending,
  remainingTierPlayer,
  returnReason,
  role,
  selectedPlayerId,
  showRemainingResolution,
  soleEligibleTeam,
  teams,
  tierAvgPrice = 0,
  tierBasePrice = 0,
  timedCloseDuration,
  warningRemaining,
  you,
}: LiveStageSpotlightProps) {
  const leadingTeam = currentBid
    ? teams.find((t) => t.id === currentBid.teamId)
    : null;
  const leadingTeamColor = leadingTeam ? getTeamColor(leadingTeam) : "#10b981";
  const [showDetails, setShowDetails] = useState(false);

  // Countdown timer calculations
  const isClosingWarning = warningRemaining !== null && warningRemaining > 0;
  const isTimedCloseActive = closeRemaining !== null && closeRemaining > 0;
  const isAntiSnipe = isTimedCloseActive && closeRemaining <= 5;

  const timerFraction = isTimedCloseActive && timedCloseDuration
    ? Math.max(0, Math.min(1, closeRemaining / timedCloseDuration))
    : isClosingWarning
      ? Math.max(0, Math.min(1, warningRemaining / 3))
      : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Special Tier Resolution Alert (if last player & sole team) */}
      {showRemainingResolution && remainingTierPlayer && soleEligibleTeam && onResolveRemaining && (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 sm:p-5 shadow-lg flex flex-col gap-3">
          <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider">
            <Sparkles className="size-4" />
            <span>Sole Eligible Team Resolution</span>
          </div>
          <p className="text-sm font-medium text-foreground">
            <span className="font-bold text-primary">{remainingTierPlayer.displayName}</span> is
            the last player in this Tier, and only{" "}
            <span className="font-bold">{soleEligibleTeam.name ?? "Team"}</span> can accept them.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <Button
              disabled={pending}
              onClick={() => onResolveRemaining("average")}
              size="sm"
              type="button"
            >
              Sell at Average Price ({tierAvgPrice.toLocaleString()} cr)
            </Button>
            <Button
              disabled={pending}
              onClick={() => onResolveRemaining("base")}
              size="sm"
              type="button"
              variant="secondary"
            >
              Sell at Base Price ({tierBasePrice.toLocaleString()} cr)
            </Button>
          </div>
        </div>
      )}

      {/* Hero Stage Card */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl p-5 sm:p-6 flex flex-col gap-5">
        {/* Ambient Top Glow */}
        <div
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 size-96 rounded-full blur-3xl opacity-20 transition-all duration-700"
          style={{
            backgroundColor: leadingTeam ? leadingTeamColor : "var(--primary)",
          }}
        />

        {/* Top Badges Strip */}
        <div className="flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-2 flex-wrap">
            {activePlayer ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-neon/15 border border-neon/40 px-2.5 py-0.5 text-xs font-bold text-neon uppercase tracking-wider">
                  <Flame className="size-3 text-neon" />
                  Active Lot
                </span>
                {activePlayer.tierLabel && (
                  <span className="rounded-full bg-muted/60 border border-border/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {activePlayer.tierLabel}
                  </span>
                )}
                {activePlayer.role && (
                  <span className="rounded-full bg-muted/40 border border-border/40 px-2 py-0.5 text-xs text-muted-foreground">
                    {activePlayer.role}
                  </span>
                )}
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                <Clock className="size-3" />
                Between Lots
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="capitalize">{closeMode === "timed" ? "Timed Close" : "Manual Close"}</span>
            <span>·</span>
            <span className={lifecycle === "paused" ? "text-amber-400 font-semibold" : "text-emerald-400 font-semibold"}>
              {lifecycle === "paused" ? "Paused" : "Live"}
            </span>
          </div>
        </div>

        {/* Centerpiece: Active Player or Between Lots */}
        {activePlayer ? (
          <div className="flex flex-col gap-5 relative z-10">
            {/* Player Info Row */}
            <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-4 min-w-0">
                <button
                  type="button"
                  className="flex size-16 sm:size-20 items-center justify-center rounded-2xl font-display text-2xl sm:text-3xl font-extrabold shadow-lg shrink-0 transition-transform cursor-pointer hover:scale-105 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setShowDetails(true)}
                  style={{
                    backgroundColor: leadingTeam ? `${leadingTeamColor}20` : "rgba(var(--primary), 0.15)",
                    borderColor: leadingTeam ? `${leadingTeamColor}60` : "var(--primary)",
                    borderWidth: "2px",
                    boxShadow: leadingTeam ? `0 0 25px ${leadingTeamColor}25` : "0 0 20px rgba(var(--primary), 0.2)",
                    color: leadingTeam ? leadingTeamColor : "var(--primary)",
                  }}
                  title="Click to view player details"
                >
                  {activePlayer.displayName.charAt(0).toUpperCase()}
                </button>

                <div className="flex flex-col min-w-0">
                  <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground truncate">
                    {activePlayer.displayName}
                  </h1>
                  <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
                    <span>Selection: {activePlayer.selectionMethod}</span>
                    {activePlayer.startingPrice && (
                      <>
                        <span>·</span>
                        <span>Starting: {formatCredits(activePlayer.startingPrice)} cr</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* View Details Button for Bidding Teams */}
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-border/80 bg-muted/30 hover:bg-muted/60 text-xs font-semibold gap-1.5 shrink-0 shadow-2xs"
                onClick={() => setShowDetails(true)}
                type="button"
              >
                <User className="size-3.5 text-primary" />
                <span>Player Details</span>
              </Button>
            </div>

            {/* High-Stakes Countdown Timer Bar (if closing or timed) */}
            {(isTimedCloseActive || isClosingWarning || finalizing) && (
              <div
                className={cn(
                  "rounded-xl border p-3 flex flex-col gap-1.5 transition-colors",
                  finalizing
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : isAntiSnipe || isClosingWarning
                      ? "border-amber-500/60 bg-amber-500/15 animate-pulse"
                      : "border-primary/30 bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <Clock className={cn("size-4", isAntiSnipe || isClosingWarning ? "text-amber-400" : "text-primary")} />
                    <span className={isAntiSnipe || isClosingWarning ? "text-amber-300" : "text-foreground"}>
                      {finalizing
                        ? "Finalizing Winning Sale…"
                        : isClosingWarning
                          ? `Closing Warning Running: ${warningRemaining?.toFixed(1)}s`
                          : isAntiSnipe
                            ? `ANTI-SNIPE WINDOW (+5s on bid): ${closeRemaining?.toFixed(1)}s`
                            : `Timed Close Countdown: ${closeRemaining?.toFixed(1)}s`}
                    </span>
                  </div>

                  <span className="font-mono text-sm font-bold tabular-nums">
                    {finalizing
                      ? "Sold"
                      : isClosingWarning
                        ? `${warningRemaining?.toFixed(1)}s`
                        : `${closeRemaining?.toFixed(1)}s`}
                  </span>
                </div>

                {/* Progress bar */}
                {!finalizing && (
                  <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-200",
                        isAntiSnipe || isClosingWarning ? "bg-amber-400" : "bg-primary",
                      )}
                      style={{ width: `${timerFraction * 100}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Price Board: 3 Elevated Columns */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-4 text-center">
              {/* Starting Price */}
              <div className="flex flex-col gap-1 rounded-xl border border-border/50 bg-muted/20 p-3">
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Starting
                </span>
                <span className="font-mono text-base sm:text-xl font-bold text-muted-foreground tabular-nums">
                  {formatCredits(activePlayer.startingPrice)}
                </span>
                <span className="text-[10px] text-muted-foreground/70">Credits</span>
              </div>

              {/* Current Leading Bid (Hero) */}
              <div
                className="flex flex-col gap-1 rounded-xl border p-3 sm:p-3.5 transition-all shadow-md relative"
                style={{
                  backgroundColor: leadingTeam ? `${leadingTeamColor}15` : "rgba(var(--primary), 0.08)",
                  borderColor: leadingTeam ? `${leadingTeamColor}60` : "var(--border)",
                  boxShadow: leadingTeam ? `0 0 25px ${leadingTeamColor}20` : "none",
                }}
              >
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-center gap-1">
                  <Crown className="size-3 text-emerald-400" />
                  Highest Bid
                </span>
                <span className="font-mono text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground tabular-nums tracking-tight">
                  {formatCredits(currentBid?.amount ?? activePlayer.startingPrice)}
                </span>
                <span className="text-[10px] text-muted-foreground font-medium">Credits</span>
              </div>

              {/* Next Bid */}
              <div className="flex flex-col gap-1 rounded-xl border border-border/50 bg-muted/20 p-3">
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Next Bid
                </span>
                <span className="font-mono text-base sm:text-xl font-bold text-foreground tabular-nums">
                  {formatCredits(nextBid)}
                </span>
                <span className="text-[10px] text-muted-foreground/70">Credits</span>
              </div>
            </div>

            {/* Leading Team Banner */}
            <div
              className="flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-all shadow-sm"
              style={{
                backgroundColor: leadingTeam ? `${leadingTeamColor}15` : "rgba(255,255,255,0.02)",
                borderColor: leadingTeam ? `${leadingTeamColor}50` : "var(--border)",
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                {leadingTeam ? (
                  <div
                    className="flex size-10 items-center justify-center rounded-xl font-display text-sm font-bold shrink-0"
                    style={{
                      backgroundColor: `${leadingTeamColor}30`,
                      borderColor: `${leadingTeamColor}70`,
                      borderWidth: "1.5px",
                      color: leadingTeamColor,
                    }}
                  >
                    {(leadingTeam.name ?? "T").charAt(0).toUpperCase()}
                  </div>
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground shrink-0">
                    <Gavel className="size-5" />
                  </div>
                )}

                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {leadingTeam ? "Current Leader" : "Opening Bid"}
                  </span>
                  <span className="font-bold text-sm sm:text-base text-foreground truncate">
                    {leadingTeam?.name ?? "No bids placed yet"}
                  </span>
                </div>
              </div>

              {leadingTeam && (
                <div className="flex items-center gap-1 text-xs font-bold text-emerald-400 shrink-0">
                  <Trophy className="size-4 text-emerald-400" />
                  <span className="hidden sm:inline">Holding Lead</span>
                </div>
              )}
            </div>

            {/* Representative Action: One-Click Bid Console */}
            {role === "representative" && (
              <div className="flex flex-col gap-2.5 rounded-xl bg-card border border-border/80 p-4 shadow-sm">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Your Team Budget</span>
                  <span className="font-mono font-bold text-foreground">
                    {formatCredits(you.remainingBudget)} cr remaining · Roster {you.rosterCount}/{you.maxRoster}
                  </span>
                </div>

                {canBid ? (
                  <Button
                    className="h-14 text-base sm:text-lg font-bold shadow-xl transition-all duration-200 active:scale-[0.98]"
                    disabled={pending}
                    onClick={onPlaceBid}
                    size="lg"
                    type="button"
                  >
                    {pending ? (
                      <Spinner className="mr-2" />
                    ) : (
                      <Gavel className="size-5 mr-2" />
                    )}
                    Place Bid: {formatCredits(nextBid)} Credits
                  </Button>
                ) : (
                  <div className="rounded-lg bg-muted/40 border border-border/50 p-3 text-center text-xs sm:text-sm text-muted-foreground flex items-center justify-center gap-2">
                    {you.isLeader ? (
                      <>
                        <CheckCircle2 className="size-4 text-emerald-400" />
                        <span className="font-semibold text-emerald-400">Your Team leads this Player!</span>
                      </>
                    ) : connectionStale ? (
                      <>
                        <AlertCircle className="size-4 text-amber-400" />
                        <span>Reconnecting before bidding is available…</span>
                      </>
                    ) : lifecycle === "paused" ? (
                      <>
                        <Pause className="size-4 text-amber-400" />
                        <span>Auction is paused</span>
                      </>
                    ) : finalizing ? (
                      <>
                        <Spinner className="size-4 text-emerald-400" />
                        <span>Finalizing this Player…</span>
                      </>
                    ) : (
                      <span>Bidding not available right now</span>
                    )}
                  </div>
                )}

                {canBid && nextBid !== null && (
                  <span className="text-[11px] text-muted-foreground text-center">
                    Budget after bid: <span className="font-mono font-semibold text-foreground">{formatCredits(Math.max(0, you.remainingBudget - nextBid))} cr</span>
                  </span>
                )}
              </div>
            )}

            {/* Organizer Active Lot Controls */}
            {role === "organizer" && (
              <div className="flex flex-col gap-3 rounded-xl bg-card border border-border/80 p-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Organizer Lot Controls
                </span>

                <div className="flex flex-wrap items-center gap-2.5">
                  {closeMode === "manual" && lifecycle === "live" && (
                    !activePlayer.warningDeadline ? (
                      <Button
                        disabled={pending}
                        onClick={onStartClose}
                        size="sm"
                        type="button"
                      >
                        Start 3-Second Close
                      </Button>
                    ) : (
                      <>
                        <Button
                          disabled={pending}
                          onClick={onCancelClose}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          Cancel Warning
                        </Button>
                        <Button
                          disabled={pending}
                          onClick={onFinalizeNow}
                          size="sm"
                          type="button"
                        >
                          Finalize Now
                        </Button>
                      </>
                    )
                  )}

                  <Button
                    disabled={pending}
                    onClick={onPauseResume}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {lifecycle === "live" ? (
                      <>
                        <Pause className="size-3.5 mr-1" /> Pause Auction
                      </>
                    ) : (
                      <>
                        <Play className="size-3.5 mr-1" /> Resume Auction
                      </>
                    )}
                  </Button>
                </div>

                {/* Return Player Row */}
                <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border/40">
                  <Field className="flex-1 min-w-40">
                    <FieldLabel htmlFor="stage-return-reason" className="text-xs">
                      Return Reason
                    </FieldLabel>
                    <Input
                      id="stage-return-reason"
                      onChange={(e) => onReturnReasonChange(e.target.value)}
                      placeholder="Reason to return player"
                      value={returnReason}
                      className="h-8 text-xs"
                    />
                  </Field>
                  <Button
                    disabled={pending || !returnReason.trim() || !!currentBid}
                    onClick={onReturnPlayer}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <RotateCcw className="size-3.5 mr-1" /> Return Player
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Between Lots State */
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center gap-4 relative z-10">
            <div className="flex size-20 items-center justify-center rounded-2xl bg-muted/30 border border-border/50 text-muted-foreground shadow-inner">
              <Gavel className="size-10 text-muted-foreground/60" />
            </div>

            <div className="flex flex-col gap-1 max-w-md">
              <h2 className="font-display text-2xl font-bold text-foreground">
                Awaiting Next Lot
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {lastSale ? (
                  <>
                    Last lot: <span className="font-semibold text-foreground">{lastSale.playerDisplayName}</span> was
                    won for <span className="font-semibold font-mono text-foreground">{lastSale.amount} cr</span>.
                  </>
                ) : (
                  "Ready to offer the next player for team bidding."
                )}
              </p>
            </div>

            {/* Organizer Quick Launcher between lots */}
            {role === "organizer" && (
              <div className="w-full max-w-lg flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm mt-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Select Next Player
                </span>

                <div className="flex flex-wrap items-end gap-2.5">
                  <Field className="flex-1 min-w-48">
                    <Select
                      items={(eligiblePlayers ?? []).map((p) => ({
                        label: p.displayName,
                        value: p.id,
                      }))}
                      onValueChange={(val) => onSelectPlayerIdChange(val ?? "")}
                      value={selectedPlayerId}
                    >
                      <SelectTrigger className="w-full h-9 text-xs">
                        <SelectValue placeholder="Choose an eligible player">
                          {(val: string | null) =>
                            val
                              ? ((eligiblePlayers ?? []).find((p) => p.id === val)?.displayName ?? val)
                              : undefined
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {(eligiblePlayers ?? []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.displayName} ({p.startingPrice} cr)
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Button
                    disabled={pending || !selectedPlayerId}
                    onClick={onOfferPlayer}
                    size="sm"
                    type="button"
                  >
                    Offer Selected
                  </Button>

                  <Button
                    disabled={pending}
                    onClick={onRandomPlayer}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <Shuffle className="size-3.5 mr-1" /> Random Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <LivePlayerDetailsDialog
        open={showDetails}
        onOpenChange={setShowDetails}
        player={
          activePlayer
            ? {
                customFields: activePlayer.customFields ?? [],
                displayName: activePlayer.displayName,
                externalPlayerId: activePlayer.externalPlayerId ?? null,
                id: activePlayer.playerEntryId,
                role: activePlayer.role,
                startingPrice: activePlayer.startingPrice,
                teamColor: leadingTeam ? leadingTeamColor : null,
                teamName: leadingTeam?.name ?? null,
                tierId: activePlayer.tierId,
                tierLabel: activePlayer.tierLabel,
              }
            : null
        }
      />
    </div>
  );
}
