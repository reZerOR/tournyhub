"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { LiveCommandOutcome } from "@/server/auction-command/live-command";
import {
  addPausedPlayerEntries,
  cancelLiveAuction,
  changePausedConstraints,
  increaseTeamBudgets,
  ManageError,
  replaceTeamRepresentative,
  transferOwnership,
} from "@/server/auction-command/paused-changes";
import {
  getAuctionManagementForOrganizer,
  type AuctionManagement,
} from "@/server/auction-query/manage";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export type ManageResult =
  | { management: AuctionManagement | null; notice: string; status: "saved" }
  | { message: string; status: "error" };

export async function loadManagementAction(
  auctionId: string,
): Promise<null | AuctionManagement> {
  const session = await getCurrentSession();
  if (!session) return null;
  return getAuctionManagementForOrganizer(
    getPool(),
    session.user.id,
    auctionId,
  );
}

function failure(error: unknown): { message: string; status: "error" } {
  if (error instanceof z.ZodError) {
    return {
      message: error.issues[0]?.message ?? "Enter valid values.",
      status: "error",
    };
  }
  if (error instanceof ManageError) {
    return { message: error.message, status: "error" };
  }
  throw error;
}

async function settle(
  auctionId: string,
  userId: string,
  outcome: LiveCommandOutcome<unknown>,
  notice: string,
): Promise<ManageResult> {
  if (outcome.status === "rejected") {
    return { message: outcome.message, status: "error" };
  }
  if (outcome.status === "unauthorized") {
    return {
      message: "You no longer organize this Auction.",
      status: "error",
    };
  }

  const management = await getAuctionManagementForOrganizer(
    getPool(),
    userId,
    auctionId,
  );
  // A cancellation succeeds even though the Auction is no longer manageable, so
  // an absent management view still counts as a committed change.
  return { management, notice, status: "saved" };
}

async function actor(): Promise<null | string> {
  const session = await getCurrentSession();
  return session?.user.id ?? null;
}

export async function replaceRepresentativeAction(
  auctionId: string,
  input: {
    email: string;
    playerEntryId: null | string;
    reason: string;
    teamId: string;
  },
): Promise<ManageResult> {
  const userId = await actor();
  if (!userId) return { message: "Sign in to continue.", status: "error" };
  try {
    const management = await getAuctionManagementForOrganizer(
      getPool(),
      userId,
      auctionId,
    );
    if (!management) {
      return {
        message: "This Auction is not yours to manage.",
        status: "error",
      };
    }
    const outcome = await replaceTeamRepresentative(getPool(), {
      actorUserId: userId,
      auctionId,
      commandId: randomUUID(),
      email: input.email,
      expectedRevision: management.revision,
      playerEntryId: input.playerEntryId,
      reason: input.reason,
      teamId: input.teamId,
    });
    return settle(auctionId, userId, outcome, "Representative replaced.");
  } catch (error) {
    return failure(error);
  }
}

export async function transferOwnershipAction(
  auctionId: string,
  input: { email: string; reason: string },
): Promise<ManageResult> {
  const userId = await actor();
  if (!userId) return { message: "Sign in to continue.", status: "error" };
  try {
    const management = await getAuctionManagementForOrganizer(
      getPool(),
      userId,
      auctionId,
    );
    if (!management) {
      return {
        message: "This Auction is not yours to manage.",
        status: "error",
      };
    }
    const outcome = await transferOwnership(getPool(), {
      actorUserId: userId,
      auctionId,
      commandId: randomUUID(),
      email: input.email,
      expectedRevision: management.revision,
      reason: input.reason,
    });
    return settle(auctionId, userId, outcome, "Ownership transferred.");
  } catch (error) {
    return failure(error);
  }
}

export async function increaseBudgetAction(
  auctionId: string,
  input: { amount: string; reason: string },
): Promise<ManageResult> {
  const userId = await actor();
  if (!userId) return { message: "Sign in to continue.", status: "error" };
  try {
    const management = await getAuctionManagementForOrganizer(
      getPool(),
      userId,
      auctionId,
    );
    if (!management) {
      return {
        message: "This Auction is not yours to manage.",
        status: "error",
      };
    }
    const outcome = await increaseTeamBudgets(getPool(), {
      actorUserId: userId,
      amount: input.amount,
      auctionId,
      commandId: randomUUID(),
      expectedRevision: management.revision,
      reason: input.reason,
    });
    return settle(auctionId, userId, outcome, "Every Team's Budget increased.");
  } catch (error) {
    return failure(error);
  }
}

export async function addPlayersAction(
  auctionId: string,
  input: {
    players: {
      displayName: string;
      phoneNumber?: string;
      role?: string;
      tierId?: null | string;
    }[];
    reason: string;
  },
): Promise<ManageResult> {
  const userId = await actor();
  if (!userId) return { message: "Sign in to continue.", status: "error" };
  try {
    const management = await getAuctionManagementForOrganizer(
      getPool(),
      userId,
      auctionId,
    );
    if (!management) {
      return {
        message: "This Auction is not yours to manage.",
        status: "error",
      };
    }
    const outcome = await addPausedPlayerEntries(getPool(), {
      actorUserId: userId,
      auctionId,
      commandId: randomUUID(),
      expectedRevision: management.revision,
      players: input.players,
      reason: input.reason,
    });
    return settle(auctionId, userId, outcome, "Player Entries added.");
  } catch (error) {
    return failure(error);
  }
}

export async function changeConstraintsAction(
  auctionId: string,
  input: {
    reason: string;
    rosterMax?: string;
    rosterMin?: string;
    tiers: { maxPerTeam: string; minPerTeam: string; tierId: string }[];
  },
): Promise<ManageResult> {
  const userId = await actor();
  if (!userId) return { message: "Sign in to continue.", status: "error" };
  try {
    const management = await getAuctionManagementForOrganizer(
      getPool(),
      userId,
      auctionId,
    );
    if (!management) {
      return {
        message: "This Auction is not yours to manage.",
        status: "error",
      };
    }
    const toNumber = (value: string | undefined) => {
      if (value === undefined || value.trim() === "") return undefined;
      return value;
    };
    const outcome = await changePausedConstraints(getPool(), {
      actorUserId: userId,
      auctionId,
      commandId: randomUUID(),
      expectedRevision: management.revision,
      reason: input.reason,
      rosterMax: toNumber(input.rosterMax),
      rosterMin: toNumber(input.rosterMin),
      tiers: input.tiers.map((tier) => ({
        maxPerTeam: Number(tier.maxPerTeam),
        minPerTeam: Number(tier.minPerTeam),
        tierId: tier.tierId,
      })),
    });
    return settle(auctionId, userId, outcome, "Constraints updated.");
  } catch (error) {
    return failure(error);
  }
}

export async function cancelAuctionAction(
  auctionId: string,
  input: { reason: string },
): Promise<ManageResult> {
  const userId = await actor();
  if (!userId) return { message: "Sign in to continue.", status: "error" };
  try {
    const management = await getAuctionManagementForOrganizer(
      getPool(),
      userId,
      auctionId,
    );
    if (!management) {
      return {
        message: "This Auction is not yours to manage.",
        status: "error",
      };
    }
    const outcome = await cancelLiveAuction(getPool(), {
      actorUserId: userId,
      auctionId,
      commandId: randomUUID(),
      expectedRevision: management.revision,
      reason: input.reason,
    });
    return settle(auctionId, userId, outcome, "Auction cancelled.");
  } catch (error) {
    return failure(error);
  }
}
