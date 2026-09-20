import { createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/config/server-env";
import { resolveLiveRole } from "@/server/auction-query/live-snapshot";
import type { Queryable } from "@/server/database/queryable";

/** A short-lived grant: long enough for a live session, short enough to revoke. */
export const REALTIME_GRANT_TTL_SECONDS = 120;

export interface RealtimeGrant {
  channel: string;
  expiresAt: string;
  token: string;
}

/** The private channel name for one Auction. */
export function auctionChannelName(auctionId: string): string {
  return `auction:${auctionId}`;
}

function sign(payload: string): string {
  return createHmac("sha256", serverEnv.BETTER_AUTH_SECRET)
    .update(payload)
    .digest("base64url");
}

function grantPayload(
  auctionId: string,
  userId: string,
  expiresAtSeconds: number,
): string {
  return `${auctionId}|${userId}|${expiresAtSeconds}`;
}

/**
 * Issues a short-lived token for the Auction's private channel after the
 * server has confirmed that the caller organizes or currently represents the
 * Auction. An unrelated User, or a former Representative after replacement,
 * receives null. The browser never sees a service credential, and the token
 * carries no authorization decision that Realtime could make on its own.
 */
export async function grantRealtimeAccess(
  db: Queryable,
  userId: string,
  auctionId: string,
  now: Date = new Date(),
): Promise<null | RealtimeGrant> {
  const role = await resolveLiveRole(db, userId, auctionId);
  if (!role) return null;

  const expiresAtSeconds =
    Math.floor(now.getTime() / 1000) + REALTIME_GRANT_TTL_SECONDS;
  const token = sign(grantPayload(auctionId, userId, expiresAtSeconds));
  return {
    channel: auctionChannelName(auctionId),
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    token,
  };
}

/** Verifies a grant for one channel, User, and moment. Used by tests and the client relay. */
export function verifyRealtimeGrant({
  auctionId,
  expiresAt,
  now = new Date(),
  token,
  userId,
}: {
  auctionId: string;
  expiresAt: string;
  now?: Date;
  token: string;
  userId: string;
}): boolean {
  const expiresAtSeconds = Math.floor(new Date(expiresAt).getTime() / 1000);
  if (!Number.isFinite(expiresAtSeconds)) return false;
  if (Math.floor(now.getTime() / 1000) >= expiresAtSeconds) return false;

  const expected = sign(grantPayload(auctionId, userId, expiresAtSeconds));
  const expectedBytes = Buffer.from(expected);
  const tokenBytes = Buffer.from(token);
  if (expectedBytes.length !== tokenBytes.length) return false;
  return timingSafeEqual(expectedBytes, tokenBytes);
}
