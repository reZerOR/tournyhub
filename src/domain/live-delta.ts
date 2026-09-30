import type { LiveSnapshot } from "@/domain/live";

/**
 * One committed change, as it is broadcast to every console. It is the outbox
 * event that already exists for the Revision plus the Revision itself, so the
 * Broadcast path adds no database work.
 */
export interface LiveDeltaEvent {
  kind: string;
  payload: Record<string, unknown>;
  revision: number;
}

/** Reads a Broadcast payload as a delta, or null when it is not one. */
export function parseLiveDeltaEvent(value: unknown): LiveDeltaEvent | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const candidate = value as Record<string, unknown>;
  const { kind, payload, revision } = candidate;
  if (typeof revision !== "number" || !Number.isInteger(revision)) return null;
  if (typeof kind !== "string" || kind.length === 0) return null;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    return null;
  return { kind, payload: payload as Record<string, unknown>, revision };
}

function text(payload: Record<string, unknown>, key: string): null | string {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function whole(payload: Record<string, unknown>, key: string): null | number {
  const value = payload[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/**
 * Applies one committed change to the state a console already shows, or returns
 * null when the console cannot apply it from the payload alone.
 *
 * A null means "resync": the caller keeps the revision pull as the source of
 * truth. The applier is deliberately conservative — it only handles changes
 * whose payload is complete and whose effect is not entangled with derived
 * facts (Tier completion, Team minimums, the Unsold Pool), because a confidently
 * wrong console is worse than one slow pull.
 *
 * It never applies `rejected` Bid details: those are private to the Organizer
 * and the submitting Team, and a Broadcast reaches every participant.
 */
export function applyLiveDelta(
  snapshot: LiveSnapshot,
  event: LiveDeltaEvent,
): LiveSnapshot | null {
  // A console can only advance one Revision at a time; any gap is resynced.
  if (event.revision !== snapshot.revision + 1) return null;
  switch (event.kind) {
    case "bid_accepted":
      return applyBidAccepted(snapshot, event);
    case "close_warning":
      return applyCloseWarning(snapshot, event);
    case "close_warning_cancelled":
      return applyCloseWarningCancelled(snapshot, event);
    default:
      return null;
  }
}

/**
 * An accepted Bid moves only self-contained state: the leading price, the Bid
 * feed, the countdown, and which Team leads. Roster, Budget, Tier counts,
 * eligibility and Team minimums are untouched, so there is nothing to refetch.
 */
function applyBidAccepted(
  snapshot: LiveSnapshot,
  event: LiveDeltaEvent,
): LiveSnapshot | null {
  const activePlayer = snapshot.activePlayer;
  if (!activePlayer) return null;
  const { payload } = event;
  const presentationId = text(payload, "presentationId");
  const teamId = text(payload, "teamId");
  const bidAttemptId = text(payload, "bidAttemptId");
  const serverTime = text(payload, "serverTime");
  const amount = whole(payload, "amount");
  const nextAmount = whole(payload, "nextBidAmount");
  const closeDeadline = payload.closeDeadline;
  if (
    presentationId === null ||
    presentationId !== activePlayer.presentationId ||
    teamId === null ||
    bidAttemptId === null ||
    serverTime === null ||
    amount === null ||
    nextAmount === null ||
    (closeDeadline !== null && typeof closeDeadline !== "string")
  )
    return null;

  return {
    ...snapshot,
    activePlayer: {
      ...activePlayer,
      // A valid Bid cancels a running Manual Close warning and, inside the
      // Timed Close response window, moves the deadline. The payload carries
      // the committed deadline, so the countdown stays authoritative.
      closeDeadline,
      state: "open",
      warningDeadline: null,
    },
    bids: [
      ...(snapshot.bids ?? []),
      { amount, id: bidAttemptId, serverTime, teamId },
    ],
    currentBid: { amount, teamId },
    nextBidAmount: nextAmount,
    revision: event.revision,
    teams: snapshot.teams.map((team) => ({
      ...team,
      isLeader: team.id === teamId,
    })),
    you: { ...snapshot.you, isLeader: snapshot.you.teamId === teamId },
  };
}

/** A Manual Close warning starts: only the Active Player's warning changes. */
function applyCloseWarning(
  snapshot: LiveSnapshot,
  event: LiveDeltaEvent,
): LiveSnapshot | null {
  const activePlayer = snapshot.activePlayer;
  const presentationId = text(event.payload, "presentationId");
  const warningDeadline = text(event.payload, "warningDeadline");
  if (
    !activePlayer ||
    presentationId === null ||
    presentationId !== activePlayer.presentationId ||
    warningDeadline === null
  )
    return null;

  return {
    ...snapshot,
    activePlayer: { ...activePlayer, state: "closing", warningDeadline },
    revision: event.revision,
  };
}

/** The warning is cancelled before its deadline: the Player reopens. */
function applyCloseWarningCancelled(
  snapshot: LiveSnapshot,
  event: LiveDeltaEvent,
): LiveSnapshot | null {
  const activePlayer = snapshot.activePlayer;
  const presentationId = text(event.payload, "presentationId");
  if (
    !activePlayer ||
    presentationId === null ||
    presentationId !== activePlayer.presentationId
  )
    return null;

  return {
    ...snapshot,
    activePlayer: { ...activePlayer, state: "open", warningDeadline: null },
    revision: event.revision,
  };
}
