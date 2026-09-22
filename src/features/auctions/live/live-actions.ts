"use server";

import { randomUUID } from "node:crypto";

import type { RulesMode } from "@/domain/auction";
import type { LiveSnapshot } from "@/domain/live";
import {
  beginManualClose,
  cancelManualClose,
  finalizePresentation,
} from "@/server/auction-command/close-player";
import {
  cancelHighestBid,
  reverseSale,
} from "@/server/auction-command/corrections";
import {
  completeAuction,
  pauseAuction,
  resumeAuction,
} from "@/server/auction-command/lifecycle";
import type { LiveCommandOutcome } from "@/server/auction-command/live-command";
import { placeBid } from "@/server/auction-command/place-bid";
import {
  loadEligiblePlayers,
  type EligiblePlayer,
  returnActivePlayer,
  selectPlayer,
} from "@/server/auction-command/select-player";
import {
  activateTier,
  closeUnsoldPool,
  requestConstrainedMatching,
  startUnsoldRound,
} from "@/server/auction-command/tier-progress";
import { resolveRemainingTierPlayer } from "@/server/auction-command/tier-resolution";
import { getLiveSnapshot } from "@/server/auction-query/live-snapshot";
import { loadOpenUnsoldRound } from "@/server/auction-query/progress";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";
import {
  CoalescingRealtimeDistributor,
  discardRealtimeSender,
} from "@/server/realtime/distributor";
import { publishPendingOutbox } from "@/server/realtime/outbox";
import { grantRealtimeAccess } from "@/server/realtime/grant";

declare global {
  var __tournyhubRealtimeDistributor: CoalescingRealtimeDistributor | undefined;
}

/**
 * One distributor per server process. The default sender discards events:
 * Realtime is an optional low-latency notification path, and the committed
 * outbox row plus snapshot recovery are enough on their own. A deployment can
 * inject a Supabase-backed sender here.
 */
function distributor(): CoalescingRealtimeDistributor {
  globalThis.__tournyhubRealtimeDistributor ??=
    new CoalescingRealtimeDistributor({ send: discardRealtimeSender });
  return globalThis.__tournyhubRealtimeDistributor;
}

export type LiveOutcomeView =
  | { notice?: string; status: "accepted" | "replayed" }
  | { message: string; reason: string; status: "rejected" }
  | { status: "unauthorized" };

export interface LiveActionPayload {
  outcome: LiveOutcomeView;
  snapshot: LiveSnapshot | null;
}

function viewOutcome(
  outcome: LiveCommandOutcome<unknown>,
  notice?: string,
): LiveOutcomeView {
  if (outcome.status === "accepted" || outcome.status === "replayed") {
    return { notice, status: outcome.status };
  }
  if (outcome.status === "rejected") {
    return {
      message: outcome.message,
      reason: outcome.reason,
      status: "rejected",
    };
  }
  return { status: "unauthorized" };
}

/** Publishes pending committed changes, then returns the caller's fresh snapshot. */
async function settle(
  auctionId: string,
  userId: string,
  outcome: LiveCommandOutcome<unknown>,
  notice?: string,
): Promise<LiveActionPayload> {
  await publishPendingOutbox(getPool(), auctionId, distributor());
  const access = await getLiveSnapshot(getPool(), userId, auctionId);
  return {
    outcome: viewOutcome(outcome, notice),
    snapshot: access?.snapshot ?? null,
  };
}

export async function loadSnapshotAction(
  auctionId: string,
): Promise<LiveSnapshot | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  const access = await getLiveSnapshot(getPool(), session.user.id, auctionId);
  return access?.snapshot ?? null;
}

/** The Players an Organizer may offer next, for manual selection. */
export async function loadEligiblePlayersAction(
  auctionId: string,
): Promise<EligiblePlayer[] | null> {
  const session = await getCurrentSession();
  if (!session) return null;

  const pool = getPool();
  const auction = await pool.query<{
    active_tier_id: null | string;
    organizer_id: string;
    rules_mode: RulesMode;
    status: string;
  }>(
    `select "organizer_id", "rules_mode", "active_tier_id", "status"
       from "auction" where "id" = $1`,
    [auctionId],
  );
  const row = auction.rows[0];
  if (!row || row.organizer_id !== session.user.id) return null;
  if (row.status !== "live" && row.status !== "paused") return null;

  const rules = await pool.query<{ default_starting_price: null | number }>(
    `select "default_starting_price" from "auction_rule_set" where "auction_id" = $1`,
    [auctionId],
  );
  const round = await loadOpenUnsoldRound(pool, auctionId);

  return loadEligiblePlayers(
    pool,
    auctionId,
    row.rules_mode,
    row.active_tier_id,
    rules.rows[0]?.default_starting_price ?? 0,
    round?.id ?? null,
  );
}

export async function realtimeGrantAction(auctionId: string): Promise<null | {
  channel: string;
  expiresAt: string;
  token: string;
}> {
  const session = await getCurrentSession();
  if (!session) return null;
  return grantRealtimeAccess(getPool(), session.user.id, auctionId);
}

export async function selectPlayerAction(
  auctionId: string,
  input: {
    expectedRevision: number;
    playerEntryId?: null | string;
    selectionMethod: "manual" | "random";
  },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await selectPlayer(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
    playerEntryId: input.playerEntryId ?? null,
    selectionMethod: input.selectionMethod,
  });
  return settle(auctionId, session.user.id, outcome);
}

export async function returnPlayerAction(
  auctionId: string,
  input: { expectedRevision: number; presentationId: string; reason: string },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await returnActivePlayer(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
    presentationId: input.presentationId,
    reason: input.reason,
  });
  return settle(auctionId, session.user.id, outcome);
}

export async function placeBidAction(
  auctionId: string,
  input: {
    amount: number;
    expectedRevision: number;
    presentationId: string;
    teamId: string;
  },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await placeBid(getPool(), {
    actorUserId: session.user.id,
    amount: input.amount,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
    presentationId: input.presentationId,
    teamId: input.teamId,
  });
  return settle(auctionId, session.user.id, outcome);
}

export async function beginCloseAction(
  auctionId: string,
  input: { expectedRevision: number; presentationId: string },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await beginManualClose(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
    presentationId: input.presentationId,
  });
  return settle(auctionId, session.user.id, outcome);
}

export async function cancelCloseAction(
  auctionId: string,
  input: { expectedRevision: number; presentationId: string },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await cancelManualClose(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
    presentationId: input.presentationId,
  });
  return settle(auctionId, session.user.id, outcome);
}

/**
 * The due-only wake-up. Any participant's client may call it when a countdown
 * reaches zero; the command finalizes only a Presentation whose database
 * deadline has passed, and duplicate callers still produce one outcome.
 */
export async function finalizeAction(
  auctionId: string,
  input: { presentationId?: null | string },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await finalizePresentation(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    presentationId: input.presentationId ?? null,
  });
  return settle(auctionId, session.user.id, outcome);
}

export async function pauseAction(
  auctionId: string,
  input: { expectedRevision: number },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await pauseAuction(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
  });
  return settle(auctionId, session.user.id, outcome);
}

export async function resumeAction(
  auctionId: string,
  input: { expectedRevision: number },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await resumeAuction(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
  });
  return settle(auctionId, session.user.id, outcome);
}

export async function activateTierAction(
  auctionId: string,
  input: { expectedRevision: number; tierId: string },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await activateTier(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
    tierId: input.tierId,
  });
  return settle(auctionId, session.user.id, outcome);
}

export async function startUnsoldRoundAction(
  auctionId: string,
  input: { expectedRevision: number },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await startUnsoldRound(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
  });
  return settle(auctionId, session.user.id, outcome, "Unsold Round opened.");
}

export async function closeUnsoldPoolAction(
  auctionId: string,
  input: { expectedRevision: number },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await closeUnsoldPool(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
  });
  return settle(
    auctionId,
    session.user.id,
    outcome,
    outcome.status === "accepted" && outcome.result.kind === "forced"
      ? "Forced Assignment created."
      : "Unsold Pool closed.",
  );
}

export async function requestMatchingAction(
  auctionId: string,
  input: { expectedRevision: number },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await requestConstrainedMatching(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
  });
  const count =
    outcome.status === "accepted" ? outcome.result.assignments.length : 0;
  return settle(
    auctionId,
    session.user.id,
    outcome,
    count === 1
      ? "One Forced Assignment created."
      : `${count} Forced Assignments created.`,
  );
}

export async function completeAuctionAction(
  auctionId: string,
  input: { expectedRevision: number },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await completeAuction(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
  });
  return settle(auctionId, session.user.id, outcome, "Auction completed.");
}

export async function cancelBidAction(
  auctionId: string,
  input: {
    expectedRevision: number;
    presentationId: string;
    reason: string;
  },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await cancelHighestBid(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
    presentationId: input.presentationId,
    reason: input.reason,
  });
  return settle(auctionId, session.user.id, outcome, "Highest Bid cancelled.");
}

export async function reverseSaleAction(
  auctionId: string,
  input: { expectedRevision: number; reason: string; saleId: string },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await reverseSale(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
    reason: input.reason,
    saleId: input.saleId,
  });
  return settle(auctionId, session.user.id, outcome, "Sale reversed.");
}

export async function resolveRemainingTierPlayerAction(
  auctionId: string,
  input: {
    expectedRevision: number;
    playerEntryId: string;
    pricing: "average" | "base";
    teamId: string;
    tierId: string;
  },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await resolveRemainingTierPlayer(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
    playerEntryId: input.playerEntryId,
    pricing: input.pricing,
    teamId: input.teamId,
    tierId: input.tierId,
  });
  return settle(
    auctionId,
    session.user.id,
    outcome,
    outcome.status === "accepted"
      ? `Sold for ${outcome.result.amount.toLocaleString()} Credits.`
      : undefined,
  );
}
