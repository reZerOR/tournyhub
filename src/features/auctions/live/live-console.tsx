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
  beginCloseAction,
  cancelCloseAction,
  finalizeAction,
  loadEligiblePlayersAction,
  loadSnapshotAction,
  placeBidAction,
  returnPlayerAction,
  selectPlayerAction,
  type LiveActionPayload,
} from "@/features/auctions/live/live-actions";

const POLL_INTERVAL_MS = 2000;

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
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<null | string>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lastSyncedAt, setLastSyncedAt] = useState(() => Date.now());
  const finalizingFor = useRef<null | string>(null);

  const refresh = useCallback(async () => {
    const next = await loadSnapshotAction(auctionId);
    if (next) {
      setSnapshot(next);
      setLastSyncedAt(Date.now());
    }
  }, [auctionId]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    // A tab wake or reconnect fetches a fresh authorized snapshot instead of
    // reconstructing missed state in the browser.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
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

  async function dispatch(action: Promise<LiveActionPayload>) {
    setPending(true);
    setMessage(null);
    const payload = await action;
    if (payload.snapshot) {
      setSnapshot(payload.snapshot);
      setLastSyncedAt(Date.now());
    }
    if (payload.outcome.status === "rejected")
      setMessage(payload.outcome.message);
    if (payload.outcome.status === "unauthorized") {
      setMessage("You no longer have access to this Auction.");
    }
    setPending(false);
  }

  const activePlayer = snapshot.activePlayer;
  const closing = activePlayer?.state === "closing";
  const warningDeadline = activePlayer?.warningDeadline
    ? new Date(activePlayer.warningDeadline).getTime()
    : null;
  const warningRemaining = warningDeadline ? warningDeadline - now : null;

  useEffect(() => {
    if (!activePlayer || !closing) {
      finalizingFor.current = null;
      return;
    }
    if (warningRemaining !== null && warningRemaining <= 0) {
      if (finalizingFor.current === activePlayer.presentationId) return;
      finalizingFor.current = activePlayer.presentationId;
      void dispatch(
        finalizeAction(auctionId, {
          presentationId: activePlayer.presentationId,
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayer?.presentationId, closing, warningRemaining]);

  const nextBid = snapshot.nextBidAmount;
  // The console polls every two seconds. Three missed intervals means the
  // snapshot may be stale, so bidding is disabled until a fresh one arrives.
  const connectionStale = now - lastSyncedAt > POLL_INTERVAL_MS * 3;
  const canBid =
    role === "representative" &&
    snapshot.lifecycle === "live" &&
    !connectionStale &&
    !!activePlayer &&
    !snapshot.you.isLeader &&
    nextBid !== null;

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
              Connection:{" "}
              <span
                className={connectionStale ? "text-destructive" : undefined}
              >
                {connectionStale ? "Reconnecting…" : "Live"}
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

          {closing && (
            <p aria-live="assertive" className="font-medium" role="status">
              {warningRemaining !== null && warningRemaining > 0
                ? `Closing in ${(warningRemaining / 1000).toFixed(1)}s`
                : "Finalizing…"}
            </p>
          )}

          {message && <FieldError>{message}</FieldError>}
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
                {connectionStale
                  ? "Reconnecting before bidding is available…"
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
              Select the next Player and control Manual Close.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
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

            {activePlayer && snapshot.closeMode === "manual" && (
              <div className="flex flex-wrap gap-3 border-t pt-4">
                {!closing ? (
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
