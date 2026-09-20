"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
import { Spinner } from "@/components/ui/spinner";
import type { LiveSnapshot } from "@/domain/live";
import {
  activateTierAction,
  beginCloseAction,
  cancelBidAction,
  cancelCloseAction,
  closeUnsoldPoolAction,
  completeAuctionAction,
  finalizeAction,
  loadEligiblePlayersAction,
  loadSnapshotAction,
  pauseAction,
  placeBidAction,
  requestMatchingAction,
  resumeAction,
  returnPlayerAction,
  reverseSaleAction,
  selectPlayerAction,
  startUnsoldRoundAction,
  type LiveActionPayload,
} from "@/features/auctions/live/live-actions";

const POLL_INTERVAL_MS = 2000;

function remainingSeconds(
  deadline: null | string,
  serverNowMs: number,
): null | number {
  if (!deadline) return null;
  return Math.max(0, (Date.parse(deadline) - serverNowMs) / 1000);
}

function formatCountdown(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

export function LiveConsole({
  auctionId,
  initialSnapshot,
  role,
}: {
  auctionId: string;
  initialSnapshot: LiveSnapshot;
  role: "organizer" | "representative";
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [eligible, setEligible] = useState<
    { displayName: string; id: string }[] | null
  >(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [saleIdToReverse, setSaleIdToReverse] = useState("");
  const [pending, setPending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState<null | string>(null);
  const [notice, setNotice] = useState<null | string>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lastSyncedAt, setLastSyncedAt] = useState(() => Date.now());
  // The browser clock is never authoritative. Every countdown is measured
  // against the offset between the server snapshot time and the local clock.
  const [clockOffsetMs, setClockOffsetMs] = useState(
    () => Date.now() - Date.parse(initialSnapshot.serverTime),
  );
  const finalizingFor = useRef<null | string>(null);

  const accept = useCallback((next: LiveSnapshot) => {
    setSnapshot(next);
    setClockOffsetMs(Date.now() - Date.parse(next.serverTime));
    setLastSyncedAt(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      const next = await loadSnapshotAction(auctionId);
      // A reconnect, a tab wake, or a skipped revision all replace the whole
      // local state with one authorized snapshot.
      if (next) accept(next);
    } catch {
      // The connection dropped mid-request. The next poll retries, and the
      // controls stay disabled until a fresh snapshot arrives.
    } finally {
      setSyncing(false);
    }
  }, [accept, auctionId]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (role !== "organizer") return;
    void loadEligiblePlayersAction(auctionId).then((players) => {
      if (players)
        setEligible(
          players.map(({ displayName, id }) => ({ displayName, id })),
        );
    });
  }, [auctionId, role, snapshot.revision]);

  async function dispatch(
    action: Promise<LiveActionPayload>,
    options: { completing?: boolean } = {},
  ) {
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
      // The connection dropped before the server answered, so nothing was
      // committed as far as this console knows. Controls stay disabled until a
      // fresh snapshot arrives.
      setMessage("The connection dropped before the server answered.");
    } finally {
      setPending(false);
    }
  }

  const activePlayer = snapshot.activePlayer;
  const serverNowMs = now - clockOffsetMs;
  const warningRemaining = remainingSeconds(
    activePlayer?.warningDeadline ?? null,
    serverNowMs,
  );
  const closeRemaining = remainingSeconds(
    activePlayer?.closeDeadline ?? null,
    serverNowMs,
  );
  // At zero the browser stops bidding and waits for the committed outcome. A
  // committed Sale or Unsold result replaces the Active Player entirely.
  const finalizing =
    !!activePlayer &&
    ((warningRemaining !== null && warningRemaining <= 0) ||
      (closeRemaining !== null && closeRemaining <= 0));

  useEffect(() => {
    if (!activePlayer || !finalizing) {
      finalizingFor.current = null;
      return;
    }
    if (finalizingFor.current === activePlayer.presentationId) return;
    finalizingFor.current = activePlayer.presentationId;
    void dispatch(
      finalizeAction(auctionId, {
        presentationId: activePlayer.presentationId,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayer?.presentationId, finalizing]);

  const nextBid = snapshot.nextBidAmount;
  // The console polls every two seconds. Three missed intervals means the
  // snapshot may be stale, so bidding is disabled until a fresh one arrives.
  const connectionStale = now - lastSyncedAt > POLL_INTERVAL_MS * 3;
  const controlsReady =
    snapshot.lifecycle === "live" && !connectionStale && !syncing && !pending;
  const canBid =
    role === "representative" &&
    controlsReady &&
    !finalizing &&
    !!activePlayer &&
    !snapshot.you.isLeader &&
    nextBid !== null;

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
      </Card>
    );
  }

  const unsoldRound = snapshot.unsoldRound;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            {snapshot.lifecycle === "paused" ? "Paused" : "Live Auction"}
          </CardTitle>
          <CardDescription>
            Revision {snapshot.revision}. Every value below is committed state
            from the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {activePlayer ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">
                Active Player
              </span>
              <span className="text-xl font-semibold">
                {activePlayer.displayName}
              </span>
              <span className="text-sm text-muted-foreground">
                {activePlayer.tierLabel ? `${activePlayer.tierLabel} · ` : ""}
                Starting Price {activePlayer.startingPrice}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No Active Player.</p>
          )}

          <div className="flex flex-wrap gap-6 text-sm">
            <span>
              Lifecycle:{" "}
              <span className="capitalize">{snapshot.lifecycle}</span>
            </span>
            <span>
              Connection:{" "}
              <span
                className={connectionStale ? "text-destructive" : undefined}
              >
                {connectionStale
                  ? "Reconnecting…"
                  : syncing
                    ? "Refreshing…"
                    : "Live"}
              </span>
            </span>
            <span>
              Controls:{" "}
              <span className={controlsReady ? undefined : "text-destructive"}>
                {controlsReady ? "Ready" : "Unavailable"}
              </span>
            </span>
            <span>
              Current price:{" "}
              <span className="tabular-nums">
                {snapshot.currentBid?.amount ??
                  activePlayer?.startingPrice ??
                  "—"}
              </span>
            </span>
            <span>
              Leading:{" "}
              {snapshot.teams.find((team) => team.isLeader)?.name ?? "No Bids"}
            </span>
            <span>
              Next Bid: <span className="tabular-nums">{nextBid ?? "—"}</span>
            </span>
          </div>

          {warningRemaining !== null && warningRemaining > 0 && (
            <p aria-live="assertive" className="font-medium" role="status">
              Closing in {formatCountdown(warningRemaining)}
            </p>
          )}

          {closeRemaining !== null && closeRemaining > 0 && !finalizing && (
            <p aria-live="polite" className="font-medium" role="status">
              Timed Close in {formatCountdown(closeRemaining)}
            </p>
          )}

          {finalizing && (
            <p aria-live="assertive" className="font-medium" role="status">
              Finalizing…
            </p>
          )}

          {snapshot.lifecycle === "paused" && (
            <p className="text-sm text-muted-foreground">
              Bidding is suspended. The Active Player and the leading Bid are
              preserved.
            </p>
          )}

          {message && <FieldError>{message}</FieldError>}
          {notice && (
            <p aria-live="polite" className="text-sm" role="status">
              {notice}
            </p>
          )}
        </CardContent>
      </Card>

      {role === "representative" && (
        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Your Team
            </CardTitle>
            <CardDescription>
              Budget {snapshot.you.remainingBudget} remaining · Roster{" "}
              {snapshot.you.rosterCount}/{snapshot.you.maxRoster}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {canBid ? (
              <Button
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
                {pending && <Spinner data-icon="inline-start" />}
                Bid {nextBid}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {connectionStale || syncing
                  ? "Reconnecting before bidding is available…"
                  : snapshot.lifecycle === "paused"
                    ? "Bidding is suspended while the Auction is Paused."
                    : finalizing
                      ? "Finalizing this Player…"
                      : snapshot.you.isLeader
                        ? "Your Team leads this Player."
                        : "Bidding is not available right now."}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {snapshot.rejections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Rejected Bids
            </CardTitle>
            <CardDescription>
              Visible only to the Organizer and the submitting Team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {snapshot.rejections.map((rejection, index) => (
                <li className="tabular-nums" key={index}>
                  {rejection.amount} — {rejection.reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {role === "organizer" && (
        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Organizer controls
            </CardTitle>
            <CardDescription>
              Select the next Player, control closing, and pause or resume the
              Auction. Completing the Auction is available while it is Paused.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
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
                  type="button"
                  variant="secondary"
                >
                  Pause Auction
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
                  type="button"
                >
                  Resume Auction
                </Button>
              )}
              <Button
                disabled={
                  pending ||
                  snapshot.lifecycle !== "paused" ||
                  !!activePlayer ||
                  snapshot.unsoldPoolCount > 0
                }
                onClick={() =>
                  dispatch(
                    completeAuctionAction(auctionId, {
                      expectedRevision: snapshot.revision,
                    }),
                    { completing: true },
                  )
                }
                type="button"
                variant="secondary"
              >
                Complete Auction
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t pt-4">
              <Field className="min-w-48 flex-1">
                <FieldLabel htmlFor="live-player">Next Player</FieldLabel>
                <select
                  className="w-full rounded-md border bg-transparent px-2 py-2 text-sm"
                  id="live-player"
                  onChange={(event) => setSelectedPlayerId(event.target.value)}
                  value={selectedPlayerId}
                >
                  <option value="">Choose a Player</option>
                  {(eligible ?? []).map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.displayName}
                    </option>
                  ))}
                </select>
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
                type="button"
                variant="secondary"
              >
                Random Player
              </Button>
            </div>

            {activePlayer && (
              <div className="flex flex-wrap items-end gap-3 border-t pt-4">
                <Field className="min-w-48 flex-1">
                  <FieldLabel htmlFor="return-reason">Return reason</FieldLabel>
                  <Input
                    id="return-reason"
                    onChange={(event) => setReturnReason(event.target.value)}
                    value={returnReason}
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
                  type="button"
                  variant="secondary"
                >
                  Return Player
                </Button>
              </div>
            )}

            {activePlayer &&
              snapshot.closeMode === "manual" &&
              snapshot.lifecycle === "live" && (
                <div className="flex flex-wrap gap-3 border-t pt-4">
                  {!activePlayer.warningDeadline ? (
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
                        type="button"
                      >
                        Finalize now
                      </Button>
                    </>
                  )}
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {role === "organizer" && snapshot.rulesMode === "tiered" && (
        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Tiers and Unsold Rounds
            </CardTitle>
            <CardDescription>
              A Tier finishes once every Player in it has been offered once.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-1 text-sm">
              {snapshot.tiers.map((tier) => (
                <li className="flex justify-between gap-3" key={tier.id}>
                  <span className="font-medium">
                    {tier.label}
                    {tier.isActive ? " (Active)" : ""}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    Offered {tier.offeredCount}/{tier.biddableCount}
                    {tier.complete ? " · Complete" : ""}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={
                  pending ||
                  !snapshot.nextTierId ||
                  snapshot.nextTierId === snapshot.activeTierId ||
                  !!activePlayer
                }
                onClick={() =>
                  dispatch(
                    activateTierAction(auctionId, {
                      expectedRevision: snapshot.revision,
                      tierId: snapshot.nextTierId!,
                    }),
                  )
                }
                type="button"
                variant="secondary"
              >
                Activate next Tier
              </Button>
              <Button
                disabled={pending || !!unsoldRound || !!activePlayer}
                onClick={() =>
                  dispatch(
                    startUnsoldRoundAction(auctionId, {
                      expectedRevision: snapshot.revision,
                    }),
                  )
                }
                type="button"
                variant="secondary"
              >
                Start Unsold Round
              </Button>
              <Button
                disabled={pending || !unsoldRound || !!activePlayer}
                onClick={() =>
                  dispatch(
                    closeUnsoldPoolAction(auctionId, {
                      expectedRevision: snapshot.revision,
                    }),
                  )
                }
                type="button"
                variant="secondary"
              >
                Close Unsold Pool
              </Button>
              <Button
                disabled={
                  pending ||
                  !unsoldRound ||
                  !!activePlayer ||
                  snapshot.deficientTeamIds.length === 0
                }
                onClick={() =>
                  dispatch(
                    requestMatchingAction(auctionId, {
                      expectedRevision: snapshot.revision,
                    }),
                  )
                }
                type="button"
              >
                Request constrained matching
              </Button>
            </div>

            {unsoldRound && (
              <p className="text-sm text-muted-foreground">
                Unsold Round {unsoldRound.sequence}: {unsoldRound.eligibleCount}{" "}
                eligible, {unsoldRound.offeredCount} offered.
              </p>
            )}
            {snapshot.deficientTeamIds.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {snapshot.deficientTeamIds.length} Team(s) still miss a required
                minimum.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {role === "organizer" && snapshot.lifecycle === "paused" && (
        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Corrections
            </CardTitle>
            <CardDescription>
              Corrections are allowed only while Paused and never delete
              history.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="correction-reason">Reason</FieldLabel>
              <Input
                id="correction-reason"
                onChange={(event) => setCorrectionReason(event.target.value)}
                value={correctionReason}
              />
            </Field>

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={
                  pending ||
                  !correctionReason.trim() ||
                  !snapshot.currentBid ||
                  !activePlayer
                }
                onClick={() =>
                  dispatch(
                    cancelBidAction(auctionId, {
                      expectedRevision: snapshot.revision,
                      presentationId: activePlayer!.presentationId,
                      reason: correctionReason,
                    }),
                  )
                }
                type="button"
                variant="secondary"
              >
                Cancel highest Bid
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t pt-4">
              <Field className="min-w-48 flex-1">
                <FieldLabel htmlFor="reverse-sale">Sale to reverse</FieldLabel>
                <select
                  className="w-full rounded-md border bg-transparent px-2 py-2 text-sm"
                  id="reverse-sale"
                  onChange={(event) => setSaleIdToReverse(event.target.value)}
                  value={saleIdToReverse}
                >
                  <option value="">Choose a Sale</option>
                  {snapshot.openSales.map((sale) => (
                    <option key={sale.saleId} value={sale.saleId}>
                      {sale.playerDisplayName} · {sale.amount}
                      {sale.source === "forced" ? " (Forced)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Button
                disabled={
                  pending || !correctionReason.trim() || !saleIdToReverse
                }
                onClick={() =>
                  dispatch(
                    reverseSaleAction(auctionId, {
                      expectedRevision: snapshot.revision,
                      reason: correctionReason,
                      saleId: saleIdToReverse,
                    }),
                  )
                }
                type="button"
                variant="secondary"
              >
                Reverse Sale
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Teams
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            {snapshot.teams.map((team) => (
              <li
                className="flex flex-wrap justify-between gap-3"
                key={team.id}
              >
                <span className="font-medium">
                  {team.name ?? "Unnamed"}
                  {team.isLeader ? " (leading)" : ""}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  Roster {team.rosterCount} · Spent {team.spentCredits} ·
                  Remaining {team.remainingBudget}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
