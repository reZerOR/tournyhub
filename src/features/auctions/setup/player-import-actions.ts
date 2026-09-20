"use server";

import { z } from "zod";

import {
  PLAYER_IMPORT_FILE_SIZE_MESSAGE,
  PLAYER_IMPORT_LIMITS,
} from "@/domain/player-import";
import { commitPlayerImport } from "@/server/auction-command/player-import";
import {
  previewPlayerImport,
  type PlayerImportPreviewData,
} from "@/server/import-export/player-import";
import { PlayerImportError } from "@/server/import-export/player-import-file";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

interface ImportActionError {
  message: string;
  status: "error";
}

export type PreviewImportResult =
  ImportActionError | { data: PlayerImportPreviewData; status: "preview" };

export type CommitImportResult =
  | ImportActionError
  | {
      duplicate: boolean;
      importedCount: number;
      status: "saved";
      warningCount: number;
    };

const NOT_EDITABLE = "This Draft is no longer available to edit.";

async function readUpload(
  formData: FormData,
): Promise<{ bytes: Uint8Array; fileName: string } | ImportActionError> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { message: "Choose a CSV or XLSX file to import.", status: "error" };
  }
  if (file.size === 0) {
    return { message: "The uploaded file is empty.", status: "error" };
  }
  if (file.size > PLAYER_IMPORT_LIMITS.maxFileBytes) {
    return { message: PLAYER_IMPORT_FILE_SIZE_MESSAGE, status: "error" };
  }

  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name,
  };
}

function mappingFrom(formData: FormData): unknown {
  const raw = formData.get("mapping");
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toImportError(error: unknown): ImportActionError {
  if (error instanceof PlayerImportError) {
    return { message: error.message, status: "error" };
  }
  if (error instanceof z.ZodError) {
    return {
      message: error.issues[0]?.message ?? "The import request was malformed.",
      status: "error",
    };
  }
  throw error;
}

export async function previewPlayerImportAction(
  auctionId: string,
  formData: FormData,
): Promise<PreviewImportResult> {
  const session = await getCurrentSession();
  if (!session) {
    return { message: "Sign in to import Player Entries.", status: "error" };
  }

  const upload = await readUpload(formData);
  if ("message" in upload) return upload;

  try {
    const data = await previewPlayerImport(
      getPool(),
      session.user.id,
      auctionId,
      upload.fileName,
      upload.bytes,
    );
    if (!data) return { message: NOT_EDITABLE, status: "error" };
    return { data, status: "preview" };
  } catch (error) {
    return toImportError(error);
  }
}

export async function commitPlayerImportAction(
  auctionId: string,
  formData: FormData,
): Promise<CommitImportResult> {
  const session = await getCurrentSession();
  if (!session) {
    return { message: "Sign in to import Player Entries.", status: "error" };
  }

  const upload = await readUpload(formData);
  if ("message" in upload) return upload;

  const commandId = formData.get("commandId");
  const worksheetName = formData.get("worksheetName");

  try {
    const result = await commitPlayerImport(
      getPool(),
      session.user.id,
      auctionId,
      upload.fileName,
      upload.bytes,
      {
        commandId: typeof commandId === "string" ? commandId : "",
        mapping: (mappingFrom(formData) ?? []) as string[],
        worksheetName: typeof worksheetName === "string" ? worksheetName : "",
      },
    );
    if (!result) return { message: NOT_EDITABLE, status: "error" };

    return {
      duplicate: result.duplicate,
      importedCount: result.importedCount,
      status: "saved",
      warningCount: result.warningCount,
    };
  } catch (error) {
    return toImportError(error);
  }
}
