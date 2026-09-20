import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { cleanupTestUsers, pool, resetLiveAuctions } from "./support";

afterAll(cleanupTestUsers);

/**
 * The real Organizers whose Auctions a test run must never touch. A distinct
 * prefix keeps them outside the test-owned scope.
 */
const REAL_EMAIL_PREFIX = "live-reset-scope-";

async function createRealOrganizerAuction(status: string): Promise<string> {
  const userId = randomUUID();
  await pool.query(
    `insert into "user" ("id", "name", "email", "emailVerified")
     values ($1, 'Real Organizer', $2, true)`,
    [userId, `${REAL_EMAIL_PREFIX}${userId}@example.com`],
  );
  const auctionId = randomUUID();
  await pool.query(
    `insert into "auction"
        ("id", "organizer_id", "title", "game", "rules_mode", "close_mode",
         "status")
     values ($1, $2, 'Real Auction', 'Chess', 'simple', 'manual', $3)`,
    [auctionId, userId, status],
  );
  return auctionId;
}

afterEach(async () => {
  // Cancel rather than delete so no Live Auction is left holding the beta's
  // single slot for the next test file. A Cancelled Auction records when and
  // why, which the database enforces.
  await pool.query(
    `update "auction" a
        set "status" = 'cancelled',
            "cancelled_at" = now(),
            "cancelled_reason" = 'Test cleanup'
       from "user" u
      where a."organizer_id" = u."id" and u."email" like $1`,
    [`${REAL_EMAIL_PREFIX}%`],
  );
  await pool.query(`delete from "user" where "email" like $1`, [
    `${REAL_EMAIL_PREFIX}%`,
  ]);
});

describe("resetLiveAuctions", () => {
  it("leaves a real Organizer's running Auction alone", async () => {
    const auctionId = await createRealOrganizerAuction("live");

    await resetLiveAuctions();

    const row = await pool.query<{ status: string }>(
      `select "status" from "auction" where "id" = $1`,
      [auctionId],
    );
    expect(row.rows[0]!.status).toBe("live");
  });

  it("returns a running test Auction to Draft", async () => {
    const userId = randomUUID();
    await pool.query(
      `insert into "user" ("id", "name", "email", "emailVerified")
       values ($1, 'Test Organizer', $2, true)`,
      [userId, `teams-slice-test-reset-${userId}@example.com`],
    );
    const auctionId = randomUUID();
    await pool.query(
      `insert into "auction"
          ("id", "organizer_id", "title", "game", "rules_mode", "close_mode",
           "status")
       values ($1, $2, 'Test Auction', 'Chess', 'simple', 'manual', 'paused')`,
      [auctionId, userId],
    );

    await resetLiveAuctions();

    const row = await pool.query<{ status: string }>(
      `select "status" from "auction" where "id" = $1`,
      [auctionId],
    );
    expect(row.rows[0]!.status).toBe("draft");
  });
});
