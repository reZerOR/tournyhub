import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/** Invitation links stay valid for seven days, matching a session's life. */
export const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export const INVITATION_STATUSES = [
  "pending",
  "accepted",
  "superseded",
  "revoked",
] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export interface TeamInvitation {
  acceptedAt: Date | null;
  acceptedByUserId: null | string;
  auctionId: string;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  invitedEmail: string;
  status: InvitationStatus;
  teamId: string;
}

/** Email addresses compare without case or surrounding whitespace. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export const invitationEmailSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.email("Enter a valid email address."),
);

export function digestInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * A single-use invitation token and the digest that is safe to store. Only
 * the digest is persisted, so a leaked database row cannot be replayed.
 */
export function createInvitationToken(): { digest: string; token: string } {
  const token = randomBytes(32).toString("base64url");
  return { digest: digestInvitationToken(token), token };
}

export function invitationExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITATION_EXPIRY_MS);
}

export function invitationHref(token: string): string {
  return `/invitations/${token}`;
}
