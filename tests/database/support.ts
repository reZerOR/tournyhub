import { randomUUID } from "node:crypto";

import type { Auction } from "@/domain/auction";
import { createDraftAuction } from "@/server/auction-command/auction-command";
import { getPool } from "@/server/database/pool";

export const pool = getPool();

/** Every user these tests create shares this prefix so one cleanup removes them. */
export const TEST_EMAIL_PREFIX = "teams-slice-test-";

export function uniqueEmail(label: string): string {
  return `${TEST_EMAIL_PREFIX}${label}-${randomUUID()}@example.com`;
}

/** A fresh email under the test prefix, for invitation and representative tests. */
export function uniqueTestEmail(label: string): string {
  return uniqueEmail(label);
}

export async function createTestUser(label: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into "user" ("id", "name", "email", "emailVerified")
     values ($1, $2, $3, true)`,
    [id, label, `${TEST_EMAIL_PREFIX}${label}-${id}@example.com`],
  );
  return id;
}

/** A User with an exact email, for invitation tests. */
export async function createTestUserWithEmail(
  email: string,
  label = "invitee",
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into "user" ("id", "name", "email", "emailVerified")
     values ($1, $2, $3, true)`,
    [id, label, email],
  );
  return id;
}

export async function createTestAuction(
  organizerId: string,
  overrides: Partial<{
    closeMode: "manual" | "timed";
    game: string;
    rulesMode: "simple" | "tiered";
    title: string;
  }> = {},
): Promise<Auction> {
  return createDraftAuction(pool, organizerId, {
    closeMode: "manual",
    game: "Chess",
    rulesMode: "simple",
    title: "Winter Classic",
    ...overrides,
  });
}

export async function cleanupTestUsers(): Promise<void> {
  await pool.query(`delete from "user" where "email" like $1`, [
    `${TEST_EMAIL_PREFIX}%`,
  ]);
}

export async function setAuctionStatus(
  auctionId: string,
  status: string,
): Promise<void> {
  await pool.query(`update "auction" set "status" = $2 where "id" = $1`, [
    auctionId,
    status,
  ]);
}
