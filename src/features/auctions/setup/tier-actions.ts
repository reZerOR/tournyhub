"use server";

import { z } from "zod";

import {
  assignPlayerTier,
  createTier,
  deleteTier,
  reorderTiers,
  TierSetupError,
  updateTier,
} from "@/server/auction-command/tiers";
import { getPlayerEntriesForOrganizer } from "@/server/auction-query/player-entries";
import { getTiersForOrganizer } from "@/server/auction-query/tiers";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";
import {
  serializeTier,
  type SerializedTier,
  type SerializedTierAssignment,
} from "@/features/auctions/setup/serialize-team";

const NOT_EDITABLE = "This Auction is no longer available to edit.";

export type TierResult =
  | { status: "saved"; tiers: SerializedTier[] }
  | { message: string; status: "error" };

export interface TiersBoard {
  assignments: SerializedTierAssignment[];
  tiers: SerializedTier[];
}

function toError(error: unknown): { message: string; status: "error" } {
  if (error instanceof z.ZodError) {
    return {
      message: error.issues[0]?.message ?? "Enter valid Tier data.",
      status: "error",
    };
  }
  if (error instanceof TierSetupError) {
    return { message: error.message, status: "error" };
  }
  throw error;
}

async function reloadTiers(
  auctionId: string,
): Promise<null | SerializedTier[]> {
  const session = await getCurrentSession();
  if (!session) return null;
  const tiers = await getTiersForOrganizer(
    getPool(),
    session.user.id,
    auctionId,
  );
  return tiers ? tiers.map(serializeTier) : null;
}

export async function loadTiersBoardAction(
  auctionId: string,
): Promise<null | TiersBoard> {
  const session = await getCurrentSession();
  if (!session) return null;

  const [tiers, entries] = await Promise.all([
    getTiersForOrganizer(getPool(), session.user.id, auctionId),
    getPlayerEntriesForOrganizer(getPool(), session.user.id, auctionId),
  ]);
  if (!tiers || !entries) return null;

  return {
    assignments: entries
      .filter((entry) => !entry.isRepresentative)
      .map((entry) => ({
        displayName: entry.displayName,
        id: entry.id,
        tierId: entry.tierId,
      })),
    tiers: tiers.map(serializeTier),
  };
}

export async function createTierAction(
  auctionId: string,
  input: {
    label: string;
    maxPerTeam: string;
    minPerTeam: string;
    startingPrice: string;
  },
): Promise<TierResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  try {
    await createTier(getPool(), session.user.id, auctionId, input);
    const tiers = await reloadTiers(auctionId);
    if (!tiers) return { message: NOT_EDITABLE, status: "error" };
    return { status: "saved", tiers };
  } catch (error) {
    return toError(error);
  }
}

export async function updateTierAction(
  auctionId: string,
  tierId: string,
  input: {
    label: string;
    maxPerTeam: string;
    minPerTeam: string;
    startingPrice: string;
  },
): Promise<TierResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  try {
    await updateTier(getPool(), session.user.id, auctionId, tierId, input);
    const tiers = await reloadTiers(auctionId);
    if (!tiers) return { message: NOT_EDITABLE, status: "error" };
    return { status: "saved", tiers };
  } catch (error) {
    return toError(error);
  }
}

export async function deleteTierAction(
  auctionId: string,
  tierId: string,
): Promise<TierResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  const removed = await deleteTier(
    getPool(),
    session.user.id,
    auctionId,
    tierId,
  );
  if (!removed) return { message: NOT_EDITABLE, status: "error" };
  const tiers = await reloadTiers(auctionId);
  if (!tiers) return { message: NOT_EDITABLE, status: "error" };
  return { status: "saved", tiers };
}

export async function moveTierAction(
  auctionId: string,
  tierId: string,
  direction: "down" | "up",
): Promise<TierResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  const tiers = await getTiersForOrganizer(
    getPool(),
    session.user.id,
    auctionId,
  );
  if (!tiers) return { message: NOT_EDITABLE, status: "error" };

  const index = tiers.findIndex((tier) => tier.id === tierId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= tiers.length) {
    return { status: "saved", tiers: tiers.map(serializeTier) };
  }

  const ordered = [...tiers];
  [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
  const reordered = await reorderTiers(getPool(), session.user.id, auctionId, {
    orderedTierIds: ordered.map((tier) => tier.id),
  });
  if (!reordered) return { message: NOT_EDITABLE, status: "error" };
  return { status: "saved", tiers: reordered.map(serializeTier) };
}

export async function assignPlayerTierAction(
  auctionId: string,
  playerEntryId: string,
  tierId: null | string,
): Promise<{ message?: string; status: "saved" | "error" }> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  try {
    const assigned = await assignPlayerTier(
      getPool(),
      session.user.id,
      auctionId,
      playerEntryId,
      tierId,
    );
    return assigned
      ? { status: "saved" }
      : { message: NOT_EDITABLE, status: "error" };
  } catch (error) {
    return toError(error);
  }
}
