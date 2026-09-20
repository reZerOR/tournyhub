"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { auctionBasicsSchema } from "@/domain/auction";
import {
  serializeAuction,
  type SerializedAuction,
} from "@/features/auctions/setup/serialize-auction";
import {
  createDraftAuction,
  updateDraftAuctionBasics,
} from "@/server/auction-command/auction-command";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export interface CreateDraftAuctionState {
  error: null | string;
  fieldErrors: Partial<
    Record<"closeMode" | "game" | "rulesMode" | "title", string>
  >;
}

function fieldErrorsFrom(
  error: z.ZodError,
): CreateDraftAuctionState["fieldErrors"] {
  const fieldErrors: CreateDraftAuctionState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      key === "title" ||
      key === "game" ||
      key === "rulesMode" ||
      key === "closeMode"
    ) {
      fieldErrors[key] ??= issue.message;
    }
  }
  return fieldErrors;
}

export async function createDraftAuctionAction(
  _previousState: CreateDraftAuctionState,
  formData: FormData,
): Promise<CreateDraftAuctionState> {
  const session = await getCurrentSession();
  if (!session) {
    return { error: "Sign in to create an Auction.", fieldErrors: {} };
  }

  const parsed = auctionBasicsSchema.safeParse({
    closeMode: formData.get("closeMode"),
    game: formData.get("game"),
    rulesMode: formData.get("rulesMode"),
    title: formData.get("title"),
  });

  if (!parsed.success) {
    return { error: null, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const auction = await createDraftAuction(
    getPool(),
    session.user.id,
    parsed.data,
  );

  redirect(`/app/auctions/${auction.id}/setup/basics`);
}

export type UpdateAuctionBasicsResult =
  | { auction: SerializedAuction; status: "saved" }
  | { message: string; status: "error" };

export async function updateAuctionBasicsAction(
  auctionId: string,
  input: {
    closeMode: string;
    game: string;
    rulesMode: string;
    title: string;
  },
): Promise<UpdateAuctionBasicsResult> {
  const session = await getCurrentSession();
  if (!session) {
    return { message: "Sign in to save changes.", status: "error" };
  }

  const parsed = auctionBasicsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? "Enter valid Basics.",
      status: "error",
    };
  }

  const auction = await updateDraftAuctionBasics(
    getPool(),
    session.user.id,
    auctionId,
    parsed.data,
  );

  if (!auction) {
    return {
      message: "This Draft is no longer available to edit.",
      status: "error",
    };
  }

  return { auction: serializeAuction(auction), status: "saved" };
}
