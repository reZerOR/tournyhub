"use server";

import { z } from "zod";

import {
  type CustomPlayerFieldInput,
  type PlayerEntryInput,
} from "@/domain/player-entry";
import {
  serializeCustomPlayerField,
  serializePlayerEntry,
  type SerializedCustomPlayerField,
  type SerializedPlayerEntry,
} from "@/features/auctions/setup/serialize-player";
import {
  createCustomPlayerField,
  createPlayerEntry,
  deleteCustomPlayerField,
  deletePlayerEntry,
  PlayerSetupError,
  updateCustomPlayerField,
  updatePlayerEntry,
} from "@/server/auction-command/player-entries";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

interface ActionError {
  message: string;
  status: "error";
}

export type PlayerEntryResult =
  ActionError | { entry: SerializedPlayerEntry; status: "saved" };

export type CustomPlayerFieldResult =
  ActionError | { field: SerializedCustomPlayerField; status: "saved" };

export type RemovedResult = ActionError | { status: "saved" };

function toError(error: unknown): ActionError {
  if (error instanceof z.ZodError) {
    return {
      message: error.issues[0]?.message ?? "Enter valid Player data.",
      status: "error",
    };
  }
  if (error instanceof PlayerSetupError) {
    return { message: error.message, status: "error" };
  }
  throw error;
}

const NOT_EDITABLE = "This Draft is no longer available to edit.";

export async function createPlayerEntryAction(
  auctionId: string,
  input: PlayerEntryInput,
): Promise<PlayerEntryResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  try {
    const entry = await createPlayerEntry(
      getPool(),
      session.user.id,
      auctionId,
      input,
    );
    if (!entry) return { message: NOT_EDITABLE, status: "error" };
    return { entry: serializePlayerEntry(entry), status: "saved" };
  } catch (error) {
    return toError(error);
  }
}

export async function updatePlayerEntryAction(
  auctionId: string,
  playerEntryId: string,
  input: PlayerEntryInput,
): Promise<PlayerEntryResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  try {
    const entry = await updatePlayerEntry(
      getPool(),
      session.user.id,
      auctionId,
      playerEntryId,
      input,
    );
    if (!entry) return { message: NOT_EDITABLE, status: "error" };
    return { entry: serializePlayerEntry(entry), status: "saved" };
  } catch (error) {
    return toError(error);
  }
}

export async function deletePlayerEntryAction(
  auctionId: string,
  playerEntryId: string,
): Promise<RemovedResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  const removed = await deletePlayerEntry(
    getPool(),
    session.user.id,
    auctionId,
    playerEntryId,
  );
  if (!removed) return { message: NOT_EDITABLE, status: "error" };
  return { status: "saved" };
}

export async function createCustomPlayerFieldAction(
  auctionId: string,
  input: CustomPlayerFieldInput,
): Promise<CustomPlayerFieldResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  try {
    const field = await createCustomPlayerField(
      getPool(),
      session.user.id,
      auctionId,
      input,
    );
    if (!field) return { message: NOT_EDITABLE, status: "error" };
    return { field: serializeCustomPlayerField(field), status: "saved" };
  } catch (error) {
    return toError(error);
  }
}

export async function updateCustomPlayerFieldAction(
  auctionId: string,
  customPlayerFieldId: string,
  input: CustomPlayerFieldInput,
): Promise<CustomPlayerFieldResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  try {
    const field = await updateCustomPlayerField(
      getPool(),
      session.user.id,
      auctionId,
      customPlayerFieldId,
      input,
    );
    if (!field) return { message: NOT_EDITABLE, status: "error" };
    return { field: serializeCustomPlayerField(field), status: "saved" };
  } catch (error) {
    return toError(error);
  }
}

export async function deleteCustomPlayerFieldAction(
  auctionId: string,
  customPlayerFieldId: string,
): Promise<RemovedResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  const removed = await deleteCustomPlayerField(
    getPool(),
    session.user.id,
    auctionId,
    customPlayerFieldId,
  );
  if (!removed) return { message: NOT_EDITABLE, status: "error" };
  return { status: "saved" };
}
