import type { LiveSnapshot } from "@/domain/live";

/**
 * The Organizer's keyboard controls for a live Auction, and the rule that stops
 * them firing while the Organizer is typing.
 */
export type LiveShortcutAction =
  "close_toggle" | "mark_unsold" | "next_player" | "pause_resume";

export const LIVE_SHORTCUTS: {
  action: LiveShortcutAction;
  description: string;
  key: string;
}[] = [
  { action: "pause_resume", description: "Pause or resume", key: "p" },
  { action: "close_toggle", description: "Begin or cancel Close", key: "c" },
  { action: "next_player", description: "Offer a random Player", key: "n" },
  { action: "mark_unsold", description: "Return the unbid Player", key: "u" },
];

/**
 * True when the event targets something the User types into, or a dialog.
 * A shortcut must never fire from a text field, a selection control, or an
 * editable element, or typing a name could pause the Auction.
 *
 * The check is structural rather than `instanceof Element`, so it is safe in a
 * server render and testable without a DOM.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const candidate = target as {
    closest?: (selector: string) => unknown;
    tagName?: string;
  };
  const tag = candidate.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (typeof candidate.closest !== "function") return false;
  if (candidate.closest('[contenteditable="true"]')) return true;
  if (candidate.closest('[role="dialog"]')) return true;
  return false;
}

/**
 * The shortcut a key event maps to, or null. Modifier combinations belong to
 * the browser and are never treated as Auction controls.
 */
export function shortcutActionFor(event: {
  altKey?: boolean;
  ctrlKey?: boolean;
  key: string;
  metaKey?: boolean;
  target: EventTarget | null;
}): LiveShortcutAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isEditableTarget(event.target)) return null;
  if (event.key.length !== 1) return null;

  const key = event.key.toLowerCase();
  return (
    LIVE_SHORTCUTS.find((shortcut) => shortcut.key === key)?.action ?? null
  );
}

function spentByTeam(snapshot: LiveSnapshot): Map<string, number> {
  return new Map(snapshot.teams.map((team) => [team.id, team.spentCredits]));
}

function teamName(snapshot: LiveSnapshot, teamId: string): string {
  return snapshot.teams.find((team) => team.id === teamId)?.name ?? "a Team";
}

/**
 * A short, participant-readable description of what changed between two
 * committed snapshots, or null when nothing material changed.
 *
 * A routine poll returns the same revision and therefore announces nothing, and
 * a countdown tick is not a snapshot change at all — so the live region speaks
 * only for Bids, closes, pauses, Sales, and Unsold results.
 */
export function describeLiveChange(
  previous: LiveSnapshot,
  next: LiveSnapshot,
): null | string {
  if (previous.lifecycle !== next.lifecycle) {
    return next.lifecycle === "paused"
      ? "The Auction is paused."
      : "The Auction is running again.";
  }
  if (previous.revision === next.revision) return null;

  const before = spentByTeam(previous);
  const after = spentByTeam(next);
  for (const [teamId, spent] of after) {
    if (spent > (before.get(teamId) ?? 0)) {
      return `A Player was sold to ${teamName(next, teamId)}.`;
    }
  }

  if (
    next.activePlayer &&
    !previous.activePlayer?.warningDeadline &&
    next.activePlayer.warningDeadline
  ) {
    return `Closing warning started for ${next.activePlayer.displayName}.`;
  }

  if (previous.activePlayer && !next.activePlayer) {
    return "The Player was not sold and returned to the queue.";
  }

  if (
    next.currentBid &&
    (next.currentBid.teamId !== previous.currentBid?.teamId ||
      next.currentBid.amount !== previous.currentBid?.amount)
  ) {
    return `${teamName(next, next.currentBid.teamId)} now leads at ${next.currentBid.amount}.`;
  }

  if (next.activePlayer && !previous.activePlayer) {
    return `${next.activePlayer.displayName} is now the Active Player.`;
  }

  return null;
}

/** The sound cue a change earns, or null when it should stay silent. */
export type LiveSoundCue = "bid" | "close" | "sold" | "unsold";

export function soundCueFor(
  previous: LiveSnapshot,
  next: LiveSnapshot,
): null | LiveSoundCue {
  if (previous.revision === next.revision) return null;

  const before = spentByTeam(previous);
  for (const [teamId, spent] of spentByTeam(next)) {
    if (spent > (before.get(teamId) ?? 0)) return "sold";
  }
  if (
    next.activePlayer &&
    !previous.activePlayer?.warningDeadline &&
    next.activePlayer.warningDeadline
  ) {
    return "close";
  }
  if (previous.activePlayer && !next.activePlayer) return "unsold";
  if (
    next.currentBid &&
    (next.currentBid.amount !== previous.currentBid?.amount ||
      next.currentBid.teamId !== previous.currentBid?.teamId)
  ) {
    return "bid";
  }
  return null;
}
