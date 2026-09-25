"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Crown,
  Gavel,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  Trophy,
  User,
} from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
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
  LiveBidItem,
  LivePlayerDetails,
  LiveSale,
  LiveSnapshot,
} from "@/domain/live";
import { authClient } from "@/features/identity/auth-client";
import {
  describeLiveChange,
  shortcutActionFor,
  soundCueFor,
  type LiveShortcutAction,
  type LiveSoundCue,
} from "@/features/auctions/live/live-feedback";
import {
  activateTierAction,
  beginCloseAction,
  cancelBidAction,
  cancelCloseAction,
  closeUnsoldPoolAction,
  completeAuctionAction,
  directSaleAction,
  finalizeAction,
  loadEligiblePlayersAction,
  pauseAction,
  placeBidAction,
  requestMatchingAction,
  resolveRemainingTierPlayerAction,
  resumeAction,
  returnPlayerAction,
  reverseSaleAction,
  selectPlayerAction,
  startUnsoldRoundAction,
  type LiveActionPayload,
} from "@/features/auctions/live/live-actions";
import { LiveBiddingChat } from "./live-bidding-chat";
import { acceptLiveSnapshot } from "./accept-live-snapshot";
import { LiveCountdown } from "./live-countdown";
import { LiveHeaderBar } from "./live-header-bar";
import { LiveOrganizerTools } from "./live-organizer-tools";
import { LivePlayerDetailsDialog } from "./live-player-details-dialog";
import { LivePlayersPanel } from "./live-players-panel";
import { LiveRosterPanel } from "./live-roster-panel";
import { formatCredits, getTeamColor } from "./live-theme";
import { useLiveSync } from "./use-live-sync";

const STALE_AFTER_MS = 20_000;

export function LiveConsole({
  auctionId,
  initialSnapshot,
  initialSoundEnabled,
  role,
}: {
  auctionId: string;
  initialSnapshot: LiveSnapshot;
  initialSoundEnabled: boolean;
  role: "organizer" | "representative";
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [eligible, setEligible] = useState<
    | {
        displayName: string;
        id: string;
        startingPrice: number;
        tierId: null | string;
      }[]
    | null
  >(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [saleIdToReverse, setSaleIdToReverse] = useState("");
  const [directSalePlayerId, setDirectSalePlayerId] = useState("");
  const [directSaleTeamId, setDirectSaleTeamId] = useState("");
  const [directSaleAmount, setDirectSaleAmount] = useState(0);
  const [detailsPlayer, setDetailsPlayer] = useState<LivePlayerDetails | null>(
    null,
  );
  const [customBidAmount, setCustomBidAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState<null | string>(null);
  const [notice, setNotice] = useState<null | string>(null);
  const lastSyncedAt = useRef<number | null>(null);
  const [connectionStale, setConnectionStale] = useState(false);
  const [expiredFor, setExpiredFor] = useState<{
    deadline: string;
    presentationId: string;
  } | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(
    () => Date.now() - Date.parse(initialSnapshot.serverTime),
  );
  const finalizingFor = useRef<null | string>(null);
  const previousSnapshot = useRef(initialSnapshot);
  const [announcement, setAnnouncement] = useState<null | string>(null);
  const [soundEnabled, setSoundEnabled] = useState(initialSoundEnabled);
  const audioContext = useRef<AudioContext | null>(null);

  const playCue = useCallback(
    (cue: LiveSoundCue) => {
      if (!soundEnabled) return;
      if (typeof window === "undefined") return;
      const Context = window.AudioContext;
      if (!Context) return;
      audioContext.current ??= new Context();
      const context = audioContext.current;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value =
        cue === "sold"
          ? 880
          : cue === "close"
            ? 440
            : cue === "bid"
              ? 660
              : 220;
      gain.gain.value = 0.05;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
    },
    [soundEnabled],
  );

  async function toggleSound(enabled: boolean): Promise<void> {
    setSoundEnabled(enabled);
    await authClient.updateUser({ soundEnabled: enabled });
  }

  const accept = useCallback(
    (next: LiveSnapshot) => {
      const previous = previousSnapshot.current;
      acceptLiveSnapshot(previous, next, (current) => {
        const change = describeLiveChange(previous, current);
        const cue = soundCueFor(previous, current);
        previousSnapshot.current = current;
        if (change) setAnnouncement(change);
        if (cue) playCue(cue);
        setSnapshot(current);
      });
    },
    [playCue],
  );

  useLiveSync({
    auctionId,
    revision: snapshot.revision,
    onSnapshot: accept,
    onClockOffset: setClockOffsetMs,
    onLost: () => {
      setConnectionStale(true);
      setMessage("You no longer have access to this Auction.");
    },
    onSynced: () => {
      lastSyncedAt.current = Date.now();
      setConnectionStale(false);
    },
  });

  useEffect(() => {
    const tick = setInterval(() => {
      lastSyncedAt.current ??= Date.now();
      setConnectionStale(Date.now() - lastSyncedAt.current > STALE_AFTER_MS);
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (role !== "organizer") return;
    void loadEligiblePlayersAction(auctionId).then((players) => {
      if (players)
        setEligible(
          players.map(({ displayName, id, startingPrice, tierId }) => ({
            displayName,
            id,
            startingPrice,
            tierId,
          })),
        );
    });
  }, [
    auctionId,
    role,
    snapshot.eligiblePlayerCount,
    snapshot.activePlayer?.presentationId,
    snapshot.lifecycle,
    snapshot.activeTierId,
  ]);

  const dispatch = useCallback(
    async (
      action: Promise<LiveActionPayload>,
      options: { completing?: boolean } = {},
    ) => {
      setPending(true);
      setMessage(null);
      setNotice(null);
      try {
        const payload = await action;
        if (payload.snapshot) {
          accept(payload.snapshot);
        } else if (options.completing) {
          setFinished(true);
        }
        if (payload.outcome.status === "rejected")
          setMessage(payload.outcome.message);
        if (payload.outcome.status === "unauthorized") {
          setMessage("You no longer have access to this Auction.");
        }
        if (
          (payload.outcome.status === "accepted" ||
            payload.outcome.status === "replayed") &&
          payload.outcome.notice
        ) {
          setNotice(payload.outcome.notice);
        }
      } catch {
        setMessage("The connection dropped before the server answered.");
      } finally {
        setPending(false);
      }
    },
    [accept],
  );

  const runShortcut = useCallback(
    (action: LiveShortcutAction) => {
      if (role !== "organizer" || pending) return;
      const active = snapshot.activePlayer;

      if (action === "pause_resume") {
        if (snapshot.lifecycle === "live") {
          void dispatch(
            pauseAction(auctionId, { expectedRevision: snapshot.revision }),
          );
        } else if (snapshot.lifecycle === "paused") {
          void dispatch(
            resumeAction(auctionId, { expectedRevision: snapshot.revision }),
          );
        }
        return;
      }

      if (action === "close_toggle") {
        if (
          !active ||
          snapshot.closeMode !== "manual" ||
          snapshot.lifecycle !== "live"
        ) {
          return;
        }
        void dispatch(
          active.warningDeadline
            ? cancelCloseAction(auctionId, {
                expectedRevision: snapshot.revision,
                presentationId: active.presentationId,
              })
            : beginCloseAction(auctionId, {
                expectedRevision: snapshot.revision,
                presentationId: active.presentationId,
              }),
        );
        return;
      }

      if (action === "next_player") {
        if (active) return;
        void dispatch(
          selectPlayerAction(auctionId, {
            expectedRevision: snapshot.revision,
            selectionMethod: "random",
          }),
        );
        return;
      }

      if (action === "mark_unsold") {
        if (!active || snapshot.currentBid) return;
        if (returnReason.trim() === "") {
          setMessage("Enter a return reason before marking the Player Unsold.");
          return;
        }
        void dispatch(
          returnPlayerAction(auctionId, {
            expectedRevision: snapshot.revision,
            presentationId: active.presentationId,
            reason: returnReason,
          }),
        );
      }
    },
    [auctionId, dispatch, pending, returnReason, role, snapshot],
  );
  const shortcutRunner = useRef(runShortcut);

  useEffect(() => {
    shortcutRunner.current = runShortcut;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = shortcutActionFor(event);
      if (!action) return;
      event.preventDefault();
      shortcutRunner.current(action);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const activePlayer = snapshot.activePlayer;
  const activeDeadline =
    activePlayer?.warningDeadline ?? activePlayer?.closeDeadline ?? null;
  const finalizing =
    !!activePlayer &&
    expiredFor?.presentationId === activePlayer.presentationId &&
    expiredFor.deadline === activeDeadline;

  const onCountdownExpired = useCallback((deadline: string) => {
    const current = previousSnapshot.current.activePlayer;
    if (
      current &&
      (current.warningDeadline ?? current.closeDeadline) === deadline
    ) {
      setExpiredFor({ deadline, presentationId: current.presentationId });
    }
  }, []);

  useEffect(() => {
    if (!activePlayer || !finalizing) {
      finalizingFor.current = null;
      return;
    }
    const presentationId = activePlayer.presentationId;
    if (finalizingFor.current === presentationId) return;
    const finalize = () => {
      const latest = previousSnapshot.current.activePlayer;
      if (
        !latest ||
        latest.presentationId !== presentationId ||
        (latest.warningDeadline ?? latest.closeDeadline) !== activeDeadline
      )
        return;
      if (finalizingFor.current === presentationId) return;
      finalizingFor.current = presentationId;
      void dispatch(finalizeAction(auctionId, { presentationId }));
    };
    if (role === "organizer") {
      finalize();
      return;
    }
    const timer = setTimeout(finalize, 1500 + Math.random() * 1000);
    return () => clearTimeout(timer);
  }, [activeDeadline, activePlayer, auctionId, dispatch, finalizing, role]);

  const nextBid = snapshot.nextBidAmount;
  const controlsReady =
    snapshot.lifecycle === "live" && !connectionStale && !pending;
  const canBid =
    role === "representative" &&
    controlsReady &&
    !finalizing &&
    !!activePlayer &&
    !snapshot.you.isLeader &&
    nextBid !== null;

  const parsedCustom =
    customBidAmount.trim() === "" ? null : Number(customBidAmount.trim());
  const isCustomValidInteger =
    parsedCustom !== null &&
    !Number.isNaN(parsedCustom) &&
    Number.isInteger(parsedCustom) &&
    parsedCustom > 0 &&
    String(parsedCustom) === customBidAmount.trim();
  const isCustomBelowMin =
    parsedCustom !== null && nextBid !== null && parsedCustom < nextBid;
  const isCustomExceedingBudget =
    parsedCustom !== null && parsedCustom > snapshot.you.remainingBudget;
  const canSubmitCustom =
    canBid &&
    !pending &&
    isCustomValidInteger &&
    !isCustomBelowMin &&
    !isCustomExceedingBudget;

  const handlePlaceCustomBid = () => {
    if (
      !canSubmitCustom ||
      parsedCustom === null ||
      !activePlayer ||
      !snapshot.you.teamId
    ) {
      return;
    }
    void dispatch(
      placeBidAction(auctionId, {
        amount: parsedCustom,
        expectedRevision: snapshot.revision,
        presentationId: activePlayer.presentationId,
        teamId: snapshot.you.teamId,
      }),
    ).then(() => {
      setCustomBidAmount("");
    });
  };

  const handleAddChip = (increment: number) => {
    const base =
      parsedCustom !== null && parsedCustom >= (nextBid ?? 0)
        ? parsedCustom
        : (nextBid ?? 0);
    setCustomBidAmount(String(base + increment));
  };

  if (finished) {
    return (
      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Auction completed
          </CardTitle>
          <CardDescription>
            The Auction is read-only. Its final Results revision is published.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            className="text-sm font-semibold text-primary underline"
            href={`/app/auctions/${auctionId}/results`}
          >
            Open Auction Results
          </Link>
        </CardContent>
      </Card>
    );
  }

  const unsoldRound = snapshot.unsoldRound;
  const activeTier = snapshot.tiers.find((t) => t.id === snapshot.activeTierId);
  const eligibleTeamsInTier = activeTier
    ? snapshot.teams.filter(
        (t) => (t.tierCounts[activeTier.id] ?? 0) < activeTier.maxPerTeam,
      )
    : [];
  const unofferedInTier = (eligible ?? []).filter(
    (p) => p.tierId === activeTier?.id,
  );
  const activePlayerInTier =
    activePlayer && activePlayer.tierId === activeTier?.id
      ? activePlayer
      : null;

  const remainingTierPlayer =
    activePlayerInTier && unofferedInTier.length === 0
      ? {
          displayName: activePlayerInTier.displayName,
          id: activePlayerInTier.playerEntryId,
          startingPrice: activePlayerInTier.startingPrice,
        }
      : !activePlayerInTier && unofferedInTier.length === 1
        ? unofferedInTier[0]!
        : null;

  const soleEligibleTeam =
    eligibleTeamsInTier.length === 1 ? eligibleTeamsInTier[0]! : null;

  const showRemainingResolution =
    role === "organizer" &&
    snapshot.rulesMode === "tiered" &&
    !!activeTier &&
    !activeTier.complete &&
    !!remainingTierPlayer &&
    !!soleEligibleTeam;

  const tierSales = activeTier
    ? snapshot.openSales.filter((s) => s.tierId === activeTier.id)
    : [];
  const tierAvgPrice =
    tierSales.length > 0
      ? Math.round(
          tierSales.reduce((sum, s) => sum + s.amount, 0) / tierSales.length,
        )
      : (remainingTierPlayer?.startingPrice ?? activeTier?.startingPrice ?? 0);
  const tierBasePrice =
    remainingTierPlayer?.startingPrice ?? activeTier?.startingPrice ?? 0;

  const leadingTeam = snapshot.currentBid
    ? snapshot.teams.find((team) => team.id === snapshot.currentBid!.teamId)
    : null;
  const leadingTeamColor = leadingTeam ? getTeamColor(leadingTeam) : "#10b981";

  const totalSpent = snapshot.teams.reduce((sum, t) => sum + t.spentCredits, 0);
  const lastCommittedSale: LiveSale | null =
    snapshot.openSales.length > 0
      ? snapshot.openSales[snapshot.openSales.length - 1]!
      : null;

  const bidsList: LiveBidItem[] = snapshot.bids ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Top Executive Header Bar */}
      <LiveHeaderBar
        activeTier={activeTier}
        auctionId={auctionId}
        closeMode={snapshot.closeMode}
        connectionStale={connectionStale}
        eligiblePlayerCount={snapshot.eligiblePlayerCount}
        lifecycle={snapshot.lifecycle}
        onToggleSound={(checked) => void toggleSound(checked)}
        revision={snapshot.revision}
        role={role}
        salesCount={snapshot.openSales.length}
        soundEnabled={soundEnabled}
        teamsCount={snapshot.teams.length}
        timedCloseSeconds={snapshot.timedCloseSeconds}
        totalSpentCredits={totalSpent}
      />

      {/* Polite live region for screen readers and auditory feedback */}
      <p aria-live="polite" className="sr-only" role="status">
        {announcement ?? ""}
      </p>

      {/* Notifications & Error alerts */}
      {message && (
        <FieldError className="text-sm font-medium">{message}</FieldError>
      )}
      {notice && (
        <p
          aria-live="polite"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-400 shadow-sm"
          role="status"
        >
          {notice}
        </p>
      )}

      <LivePlayersPanel
        players={snapshot.players}
        tiers={snapshot.tiers}
        teams={snapshot.teams}
        connectionStale={connectionStale}
      />

      {/* Main 3-Column Arena Grid */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Column 1: The Spotlight Stage & Bidding Controls (5 cols on lg, 5 on xl) */}
        <div className="flex flex-col gap-5 lg:col-span-6 xl:col-span-5">
          {/* Main Stage Spotlight Card */}
          <Card className="relative overflow-hidden border-border/80 bg-card/90 shadow-xl">
            <CardHeader className="border-b border-border/50 pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle
                  aria-level={2}
                  role="heading"
                  className="text-xl font-bold tracking-tight sm:text-2xl"
                >
                  {snapshot.lifecycle === "paused" ? "Paused" : "Live Auction"}
                </CardTitle>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  Revision {snapshot.revision}
                </span>
              </div>
              <CardDescription>
                {snapshot.lifecycle === "paused"
                  ? "The Auction is paused. Bidding is suspended."
                  : "Live bidding stage. Every value reflects committed server state."}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-5 pt-4">
              {/* Active Player Spotlight or Between Lots */}
              {activePlayer ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3.5">
                    <button
                      type="button"
                      className="flex size-14 shrink-0 cursor-pointer items-center justify-center rounded-2xl font-display text-xl font-black shadow-md transition-transform hover:scale-105 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:size-16 sm:text-2xl"
                      onClick={() =>
                        setDetailsPlayer({
                          customFields: activePlayer.customFields ?? [],
                          displayName: activePlayer.displayName,
                          externalPlayerId:
                            activePlayer.externalPlayerId ?? null,
                          id: activePlayer.playerEntryId,
                          role: activePlayer.role,
                          startingPrice: activePlayer.startingPrice,
                          teamColor: leadingTeam ? leadingTeamColor : null,
                          teamName: leadingTeam?.name ?? null,
                          tierId: activePlayer.tierId,
                          tierLabel: activePlayer.tierLabel,
                        })
                      }
                      style={{
                        backgroundColor: leadingTeam
                          ? `${leadingTeamColor}20`
                          : "rgba(var(--primary), 0.15)",
                        borderColor: leadingTeam
                          ? `${leadingTeamColor}70`
                          : "var(--primary)",
                        borderWidth: "2px",
                        color: leadingTeam
                          ? leadingTeamColor
                          : "var(--primary)",
                      }}
                      title="Click to view player details"
                    >
                      {activePlayer.displayName.charAt(0).toUpperCase()}
                    </button>

                    <div className="flex min-w-0 flex-col">
                      <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                        Active Player
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-display text-xl font-extrabold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
                          {activePlayer.displayName}
                        </h2>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 gap-1 rounded-lg border-border/70 bg-muted/30 px-2 text-[11px] hover:bg-muted/60"
                          onClick={() =>
                            setDetailsPlayer({
                              customFields: activePlayer.customFields ?? [],
                              displayName: activePlayer.displayName,
                              externalPlayerId:
                                activePlayer.externalPlayerId ?? null,
                              id: activePlayer.playerEntryId,
                              role: activePlayer.role,
                              startingPrice: activePlayer.startingPrice,
                              teamColor: leadingTeam ? leadingTeamColor : null,
                              teamName: leadingTeam?.name ?? null,
                              tierId: activePlayer.tierId,
                              tierLabel: activePlayer.tierLabel,
                            })
                          }
                          type="button"
                        >
                          <User className="size-3 text-primary" />
                          <span>Details</span>
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {activePlayer.tierLabel && (
                          <span className="font-semibold text-neon">
                            {activePlayer.tierLabel}
                          </span>
                        )}
                        <span>·</span>
                        <span>Starting Price {activePlayer.startingPrice}</span>
                      </div>
                    </div>
                  </div>

                  {/* Countdown Readout (matches regex and attributes expected by tests) */}
                  <LiveCountdown
                    closeDeadline={activePlayer.closeDeadline}
                    clockOffsetMs={clockOffsetMs}
                    onExpired={onCountdownExpired}
                    warningDeadline={activePlayer.warningDeadline}
                  />

                  {/* Price Board: 3 Elevated Columns */}
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="flex flex-col gap-0.5 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                      <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                        Starting
                      </span>
                      <span className="font-mono text-base font-bold text-muted-foreground tabular-nums">
                        {formatCredits(activePlayer.startingPrice)}
                      </span>
                    </div>

                    <div
                      className="flex flex-col gap-0.5 rounded-xl border p-2.5 shadow-sm transition-all"
                      style={{
                        backgroundColor: leadingTeam
                          ? `${leadingTeamColor}18`
                          : "rgba(255,255,255,0.03)",
                        borderColor: leadingTeam
                          ? `${leadingTeamColor}60`
                          : "var(--border)",
                      }}
                    >
                      <span className="flex items-center justify-center gap-1 text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
                        <Crown className="size-3 text-emerald-400" /> Current
                      </span>
                      <span className="font-mono text-xl font-black tracking-tight text-foreground tabular-nums sm:text-2xl">
                        {formatCredits(
                          snapshot.currentBid?.amount ??
                            activePlayer.startingPrice,
                        )}
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                      <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                        Next Bid
                      </span>
                      <span className="font-mono text-base font-bold text-foreground tabular-nums">
                        {formatCredits(nextBid)}
                      </span>
                    </div>
                  </div>

                  {/* Leading Team Banner */}
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl border p-3 transition-all"
                    style={{
                      backgroundColor: leadingTeam
                        ? `${leadingTeamColor}14`
                        : "rgba(255,255,255,0.02)",
                      borderColor: leadingTeam
                        ? `${leadingTeamColor}50`
                        : "var(--border)",
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {leadingTeam ? (
                        <div
                          className="flex size-9 shrink-0 items-center justify-center rounded-xl font-display text-xs font-bold shadow-xs"
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
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                          <Gavel className="size-4" />
                        </div>
                      )}

                      <div className="flex min-w-0 flex-col">
                        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                          Leading Team
                        </span>
                        <span className="truncate text-sm font-bold text-foreground">
                          {leadingTeam
                            ? `${leadingTeam.name} (leading)`
                            : "No Bids yet"}
                        </span>
                      </div>
                    </div>

                    {leadingTeam && (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-400">
                        <Trophy className="size-3.5 text-emerald-400" />
                        <span>Holding Lead</span>
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground">
                    <Gavel className="size-6" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">
                    No Active Player.
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {lastCommittedSale
                      ? `Last Sale: ${lastCommittedSale.playerDisplayName} for ${lastCommittedSale.amount} cr.`
                      : "Awaiting next lot."}
                  </p>
                </div>
              )}

              {/* Status bar details */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                <span>
                  Lifecycle:{" "}
                  <span className="font-semibold text-foreground capitalize">
                    {snapshot.lifecycle}
                  </span>
                </span>
                <span>
                  Connection:{" "}
                  <span
                    className={
                      connectionStale
                        ? "font-bold text-destructive"
                        : "font-medium text-emerald-400"
                    }
                  >
                    {connectionStale ? "Reconnecting…" : "Live"}
                  </span>
                </span>
                <span>
                  Controls:{" "}
                  <span
                    className={
                      controlsReady
                        ? "font-medium text-emerald-400"
                        : "font-bold text-destructive"
                    }
                  >
                    {controlsReady ? "Ready" : "Unavailable"}
                  </span>
                </span>
                <span>
                  Current price:{" "}
                  <span className="font-mono font-semibold text-foreground tabular-nums">
                    {snapshot.currentBid?.amount ??
                      activePlayer?.startingPrice ??
                      "—"}
                  </span>
                </span>
                <span>
                  Leading:{" "}
                  {leadingTeam ? `${leadingTeam.name} (leading)` : "No Bids"}
                </span>
                <span>
                  Next Bid:{" "}
                  <span className="font-mono font-semibold text-foreground tabular-nums">
                    {nextBid ?? "—"}
                  </span>
                </span>
              </div>

              {snapshot.lifecycle === "paused" && (
                <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs font-medium text-amber-400/90">
                  The Auction is paused. Bidding is suspended. The Active Player
                  and the leading Bid are preserved.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Representative Action Console Card */}
          {role === "representative" && (
            <Card className="border-border/80 bg-card/90 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle
                  aria-level={2}
                  role="heading"
                  className="text-lg font-bold"
                >
                  Your Team
                </CardTitle>
                <CardDescription>
                  Budget {snapshot.you.remainingBudget} remaining · Roster{" "}
                  {snapshot.you.rosterCount}/{snapshot.you.maxRoster}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3.5">
                {canBid ? (
                  <>
                    <Button
                      className="h-13 text-base font-bold shadow-lg transition-transform active:scale-[0.98] sm:text-lg"
                      disabled={pending}
                      onClick={() =>
                        dispatch(
                          placeBidAction(auctionId, {
                            amount: nextBid!,
                            expectedRevision: snapshot.revision,
                            presentationId: activePlayer!.presentationId,
                            teamId: snapshot.you.teamId!,
                          }),
                        )
                      }
                      type="button"
                    >
                      {pending && <Spinner className="mr-2" />}
                      Bid {nextBid}
                    </Button>

                    <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                          Custom Jump Bid
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Min:{" "}
                          <span className="font-mono font-bold text-foreground">
                            {nextBid} cr
                          </span>
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {[100, 500, 1000, 2500].map((inc) => (
                          <button
                            key={inc}
                            type="button"
                            onClick={() => handleAddChip(inc)}
                            disabled={pending}
                            className="cursor-pointer rounded-lg border border-border/80 bg-background/80 px-2.5 py-1 font-mono text-xs font-medium text-foreground transition-all hover:bg-muted/80 active:scale-95 disabled:opacity-50"
                          >
                            +{inc.toLocaleString()}
                          </button>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="1"
                          min={nextBid ?? 1}
                          value={customBidAmount}
                          onChange={(e) => setCustomBidAmount(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && canSubmitCustom) {
                              e.preventDefault();
                              handlePlaceCustomBid();
                            }
                          }}
                          placeholder={`Min: ${nextBid}`}
                          disabled={pending}
                          className={cn(
                            "h-10 font-mono text-sm",
                            (isCustomBelowMin || isCustomExceedingBudget) &&
                              "border-destructive focus-visible:ring-destructive",
                          )}
                        />

                        <Button
                          type="button"
                          disabled={!canSubmitCustom}
                          onClick={handlePlaceCustomBid}
                          className="h-10 shrink-0 px-4 font-semibold"
                          variant="secondary"
                        >
                          {pending && <Spinner className="mr-1.5" />}
                          Bid Custom
                        </Button>
                      </div>

                      {isCustomBelowMin && (
                        <p className="text-[11px] font-medium text-amber-400">
                          Minimum bid is now {nextBid} cr.
                        </p>
                      )}
                      {isCustomExceedingBudget && (
                        <p className="text-[11px] font-medium text-destructive">
                          Exceeds your remaining Budget (
                          {snapshot.you.remainingBudget} cr).
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-3 text-center text-xs font-medium text-muted-foreground sm:text-sm">
                    {connectionStale
                      ? "Reconnecting before bidding is available…"
                      : snapshot.lifecycle === "paused"
                        ? "Bidding is suspended while the Auction is Paused."
                        : finalizing
                          ? "Finalizing this Player…"
                          : snapshot.you.isLeader
                            ? "Your Team leads this Player."
                            : "Bidding is not available right now."}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Special Remaining Tier Player Resolution */}
          {showRemainingResolution && (
            <div className="flex flex-col gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4 shadow-sm">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold tracking-wider text-primary uppercase">
                  Last Player in {activeTier.label}
                </span>
                <p className="text-sm font-medium">
                  <span className="font-bold">
                    {remainingTierPlayer.displayName}
                  </span>{" "}
                  is the last Player in this Tier, and only{" "}
                  <span className="font-bold">
                    {soleEligibleTeam.name ?? "Team"}
                  </span>{" "}
                  remains eligible.
                </p>
                <p className="text-xs text-muted-foreground">
                  Choose how to assign this Player to complete the Tier:
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <Button
                  disabled={pending}
                  onClick={() =>
                    dispatch(
                      resolveRemainingTierPlayerAction(auctionId, {
                        expectedRevision: snapshot.revision,
                        playerEntryId: remainingTierPlayer.id,
                        pricing: "average",
                        teamId: soleEligibleTeam.id,
                        tierId: activeTier.id,
                      }),
                    )
                  }
                  size="sm"
                  type="button"
                >
                  Sell at Average Price ({tierAvgPrice.toLocaleString()} cr)
                </Button>
                <Button
                  disabled={pending}
                  onClick={() =>
                    dispatch(
                      resolveRemainingTierPlayerAction(auctionId, {
                        expectedRevision: snapshot.revision,
                        playerEntryId: remainingTierPlayer.id,
                        pricing: "base",
                        teamId: soleEligibleTeam.id,
                        tierId: activeTier.id,
                      }),
                    )
                  }
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Sell at Base Price ({tierBasePrice.toLocaleString()} cr)
                </Button>
              </div>
            </div>
          )}

          {/* Organizer Primary Controls */}
          {role === "organizer" && (
            <Card className="border-border/80 bg-card/90 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle
                  aria-level={2}
                  role="heading"
                  className="text-lg font-bold"
                >
                  Organizer controls
                </CardTitle>
                <CardDescription>
                  Select the next Player, control closing, and pause or resume
                  the Auction.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2.5">
                  {snapshot.lifecycle === "live" ? (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        dispatch(
                          pauseAction(auctionId, {
                            expectedRevision: snapshot.revision,
                          }),
                        )
                      }
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <Pause className="mr-1 size-3.5" /> Pause Auction
                    </Button>
                  ) : (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        dispatch(
                          resumeAction(auctionId, {
                            expectedRevision: snapshot.revision,
                          }),
                        )
                      }
                      size="sm"
                      type="button"
                    >
                      <Play className="mr-1 size-3.5" /> Resume Auction
                    </Button>
                  )}

                  {activePlayer &&
                    snapshot.closeMode === "manual" &&
                    snapshot.lifecycle === "live" &&
                    (!activePlayer.warningDeadline ? (
                      <Button
                        disabled={pending}
                        onClick={() =>
                          dispatch(
                            beginCloseAction(auctionId, {
                              expectedRevision: snapshot.revision,
                              presentationId: activePlayer.presentationId,
                            }),
                          )
                        }
                        size="sm"
                        type="button"
                      >
                        Start 3-second close
                      </Button>
                    ) : (
                      <>
                        <Button
                          disabled={pending}
                          onClick={() =>
                            dispatch(
                              cancelCloseAction(auctionId, {
                                expectedRevision: snapshot.revision,
                                presentationId: activePlayer.presentationId,
                              }),
                            )
                          }
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          Cancel warning
                        </Button>
                        <Button
                          disabled={pending}
                          onClick={() =>
                            dispatch(
                              finalizeAction(auctionId, {
                                presentationId: activePlayer.presentationId,
                              }),
                            )
                          }
                          size="sm"
                          type="button"
                        >
                          Finalize now
                        </Button>
                      </>
                    ))}
                </div>

                {/* Offer Next Player Selection (shadcn Select) */}
                <div className="flex flex-wrap items-end gap-2.5 border-t border-border/50 pt-3">
                  <Field className="min-w-44 flex-1">
                    <FieldLabel htmlFor="live-player" className="text-xs">
                      Next Player
                    </FieldLabel>
                    <Select
                      items={(eligible ?? []).map((player) => ({
                        label: player.displayName,
                        value: player.id,
                      }))}
                      onValueChange={(val) => setSelectedPlayerId(val ?? "")}
                      value={selectedPlayerId}
                    >
                      <SelectTrigger
                        className="h-9 w-full text-xs"
                        id="live-player"
                      >
                        <SelectValue placeholder="Choose a Player">
                          {(val: string | null) =>
                            val
                              ? ((eligible ?? []).find((p) => p.id === val)
                                  ?.displayName ?? val)
                              : undefined
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {(eligible ?? []).map((player) => (
                            <SelectItem key={player.id} value={player.id}>
                              {player.displayName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Button
                    disabled={pending || !selectedPlayerId || !!activePlayer}
                    onClick={() =>
                      dispatch(
                        selectPlayerAction(auctionId, {
                          expectedRevision: snapshot.revision,
                          playerEntryId: selectedPlayerId,
                          selectionMethod: "manual",
                        }),
                      )
                    }
                    size="sm"
                    type="button"
                  >
                    Offer Player
                  </Button>

                  <Button
                    disabled={pending || !!activePlayer}
                    onClick={() =>
                      dispatch(
                        selectPlayerAction(auctionId, {
                          expectedRevision: snapshot.revision,
                          selectionMethod: "random",
                        }),
                      )
                    }
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <Shuffle className="mr-1 size-3.5" /> Random Player
                  </Button>
                </div>

                {/* Return Player Input */}
                {activePlayer && (
                  <div className="flex flex-wrap items-end gap-2.5 border-t border-border/50 pt-3">
                    <Field className="min-w-44 flex-1">
                      <FieldLabel htmlFor="return-reason" className="text-xs">
                        Return reason
                      </FieldLabel>
                      <Input
                        id="return-reason"
                        onChange={(e) => setReturnReason(e.target.value)}
                        placeholder="Reason to return player"
                        value={returnReason}
                        className="h-9 text-xs"
                      />
                    </Field>
                    <Button
                      disabled={
                        pending || !returnReason.trim() || !!snapshot.currentBid
                      }
                      onClick={() =>
                        dispatch(
                          returnPlayerAction(auctionId, {
                            expectedRevision: snapshot.revision,
                            presentationId: activePlayer.presentationId,
                            reason: returnReason,
                          }),
                        )
                      }
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <RotateCcw className="mr-1 size-3.5" /> Return Player
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Column 2: Live Bidding Chat / Activity Stream (4 cols on lg, 4 on xl) */}
        <div className="flex flex-col gap-4 lg:col-span-6 xl:col-span-4">
          <LiveBiddingChat
            activePlayer={activePlayer}
            bids={bidsList}
            clockOffsetMs={clockOffsetMs}
            currentBid={snapshot.currentBid}
            finalizing={finalizing}
            lastSale={lastCommittedSale}
            nextBidAmount={nextBid}
            teams={snapshot.teams}
          />
        </div>

        {/* Column 3: Teams & Squad Rosters War Room (12 cols on lg, 3 on xl) */}
        <LiveRosterPanel
          auctionId={auctionId}
          currentBid={snapshot.currentBid}
          onPlayerDetails={setDetailsPlayer}
          teams={snapshot.teams}
          youTeamId={snapshot.you.teamId}
        />
      </div>

      {/* Organizer Deeper Administrative Tools (Expandable below arena) */}
      {role === "organizer" && (
        <LiveOrganizerTools
          activePlayer={activePlayer}
          activeTierId={snapshot.activeTierId}
          correctionReason={correctionReason}
          currentBid={snapshot.currentBid}
          deficientTeamIds={snapshot.deficientTeamIds}
          directSaleAmount={directSaleAmount}
          directSalePlayerId={directSalePlayerId}
          directSaleTeamId={directSaleTeamId}
          eligiblePlayersForDirectSale={eligible ?? []}
          lifecycle={snapshot.lifecycle}
          nextTierId={snapshot.nextTierId}
          onActivateTier={(tierId) =>
            dispatch(
              activateTierAction(auctionId, {
                expectedRevision: snapshot.revision,
                tierId,
              }),
            )
          }
          onCancelHighestBid={() =>
            dispatch(
              cancelBidAction(auctionId, {
                expectedRevision: snapshot.revision,
                presentationId: activePlayer!.presentationId,
                reason: correctionReason,
              }),
            )
          }
          onCloseUnsoldPool={() =>
            dispatch(
              closeUnsoldPoolAction(auctionId, {
                expectedRevision: snapshot.revision,
              }),
            )
          }
          onCompleteAuction={() =>
            dispatch(
              completeAuctionAction(auctionId, {
                expectedRevision: snapshot.revision,
              }),
              { completing: true },
            )
          }
          onCorrectionReasonChange={setCorrectionReason}
          onDirectSale={() => {
            void dispatch(
              directSaleAction(auctionId, {
                amount: directSaleAmount,
                expectedRevision: snapshot.revision,
                playerEntryId: directSalePlayerId,
                reason: correctionReason,
                teamId: directSaleTeamId,
              }),
            ).then(() => {
              setDirectSalePlayerId("");
              setDirectSaleTeamId("");
              setDirectSaleAmount(0);
            });
          }}
          onDirectSaleAmountChange={setDirectSaleAmount}
          onDirectSalePlayerChange={setDirectSalePlayerId}
          onDirectSaleTeamChange={setDirectSaleTeamId}
          onRequestMatching={() =>
            dispatch(
              requestMatchingAction(auctionId, {
                expectedRevision: snapshot.revision,
              }),
            )
          }
          onReverseSale={(saleId) =>
            dispatch(
              reverseSaleAction(auctionId, {
                expectedRevision: snapshot.revision,
                reason: correctionReason,
                saleId,
              }),
            )
          }
          onSaleIdToReverseChange={setSaleIdToReverse}
          onStartUnsoldRound={() =>
            dispatch(
              startUnsoldRoundAction(auctionId, {
                expectedRevision: snapshot.revision,
              }),
            )
          }
          openSales={snapshot.openSales}
          pending={pending}
          rejections={snapshot.rejections}
          revision={snapshot.revision}
          rulesMode={snapshot.rulesMode}
          saleIdToReverse={saleIdToReverse}
          teams={snapshot.teams}
          tiers={snapshot.tiers}
          unsoldPoolCount={snapshot.unsoldPoolCount}
          unsoldRound={unsoldRound}
        />
      )}

      {/* Player Details Dialog */}
      <LivePlayerDetailsDialog
        open={!!detailsPlayer}
        onOpenChange={(open) => {
          if (!open) setDetailsPlayer(null);
        }}
        player={detailsPlayer}
      />
    </div>
  );
}
