"use server";

import { redirect } from "next/navigation";

import {
  AuctionStartError,
  startAuction,
} from "@/server/auction-command/start-auction";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export type StartResult =
  | { issues: string[]; message: string; status: "error" }
  | { status: "started" };

export async function startAuctionAction(
  auctionId: string,
): Promise<StartResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      issues: [],
      message: "Sign in to start the Auction.",
      status: "error",
    };
  }

  try {
    const started = await startAuction(getPool(), session.user.id, auctionId);
    if (!started) {
      return {
        issues: [],
        message: "This Auction is no longer available to start.",
        status: "error",
      };
    }
  } catch (error) {
    if (error instanceof AuctionStartError) {
      return { issues: error.issues, message: error.message, status: "error" };
    }
    throw error;
  }

  redirect("/app");
}
