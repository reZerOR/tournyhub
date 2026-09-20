"use server";

import { revalidatePath } from "next/cache";

import {
  ArchiveError,
  archiveAuction,
  restoreAuction,
} from "@/server/auction-command/archive";
import {
  CopyAuctionError,
  copyAuction,
} from "@/server/auction-command/copy-auction";
import {
  getCopySourceForOrganizer,
  type CopySourceDetail,
} from "@/server/auction-query/lifecycle";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export type ArchiveActionResult =
  | { archiveDeadline: string; status: "archived" }
  | { message: string; status: "error" };

export type RestoreActionResult =
  { status: "restored" } | { message: string; status: "error" };

export type CopyActionResult =
  | { auctionId: string; copiedPlayerCount: number; status: "copied" }
  | { message: string; status: "error" };

function toArchiveError(error: unknown): { message: string; status: "error" } {
  if (error instanceof ArchiveError || error instanceof CopyAuctionError) {
    return { message: error.message, status: "error" };
  }
  throw error;
}

export async function archiveAuctionAction(
  auctionId: string,
): Promise<ArchiveActionResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to archive.", status: "error" };

  try {
    const archived = await archiveAuction(
      getPool(),
      session.user.id,
      auctionId,
    );
    if (!archived) {
      return {
        message: "This Auction is not yours to archive.",
        status: "error",
      };
    }
    revalidatePath("/app");
    return {
      archiveDeadline: archived.archiveDeadline,
      status: "archived",
    };
  } catch (error) {
    return toArchiveError(error);
  }
}

export async function restoreAuctionAction(
  auctionId: string,
): Promise<RestoreActionResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to restore.", status: "error" };

  try {
    const restored = await restoreAuction(
      getPool(),
      session.user.id,
      auctionId,
    );
    if (!restored) {
      return {
        message: "This Auction is not yours to restore.",
        status: "error",
      };
    }
    revalidatePath("/app");
    return { status: "restored" };
  } catch (error) {
    return toArchiveError(error);
  }
}

export async function loadCopySourceAction(
  sourceAuctionId: string,
): Promise<CopySourceDetail | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  return getCopySourceForOrganizer(getPool(), session.user.id, sourceAuctionId);
}

export async function copyAuctionAction(input: {
  keepTierAndPrice: boolean;
  playerEntryIds: string[];
  sourceAuctionId: string;
  title: string;
}): Promise<CopyActionResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to copy.", status: "error" };

  try {
    const copied = await copyAuction(getPool(), session.user.id, input);
    if (!copied) {
      return {
        message: "That Auction is not one you can copy.",
        status: "error",
      };
    }
    revalidatePath("/app");
    return {
      auctionId: copied.auctionId,
      copiedPlayerCount: copied.copiedPlayerCount,
      status: "copied",
    };
  } catch (error) {
    return toArchiveError(error);
  }
}
