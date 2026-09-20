import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  FeedbackError,
  submitFeedback,
} from "@/server/auction-command/feedback";
import { cleanupTestUsers, createTestUser, pool } from "./support";

afterAll(cleanupTestUsers);
beforeEach(async () => {
  await cleanupTestUsers();
});

describe("submitFeedback", () => {
  it("stores only the User, page, category, message, and server timestamp", async () => {
    const userId = await createTestUser("feedback-store");
    const result = await submitFeedback(pool, userId, {
      category: "confusing",
      message: "I could not tell which Team was leading.",
      page: "/app/auctions/abc/live",
    });

    const rows = await pool.query<Record<string, unknown>>(
      `select * from "feedback" where "id" = $1`,
      [result.id],
    );
    expect(Object.keys(rows.rows[0]!).sort()).toEqual([
      "category",
      "created_at",
      "id",
      "message",
      "page",
      "user_id",
    ]);
    expect(rows.rows[0]).toMatchObject({
      category: "confusing",
      message: "I could not tell which Team was leading.",
      page: "/app/auctions/abc/live",
      user_id: userId,
    });

    // The table cannot carry protected Auction data: there is no column for an
    // Auction, a Team, a snapshot, a phone number, or a credential.
    const columns = await pool.query<{ column_name: string }>(
      `select "column_name" from information_schema.columns
        where "table_name" = 'feedback'`,
    );
    const names = columns.rows.map((row) => row.column_name);
    for (const forbidden of [
      "auction_id",
      "team_id",
      "snapshot",
      "phone_number",
      "token",
      "otp",
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("records no Auction snapshot even when the message looks like one", async () => {
    const userId = await createTestUser("feedback-redaction");
    const result = await submitFeedback(pool, userId, {
      category: "other",
      message: "player_id=123 phone=+8801111111 otp=123456",
      page: "/app",
    });

    const rows = await pool.query<{ message: string }>(
      `select "message" from "feedback" where "id" = $1`,
      [result.id],
    );
    // The message is stored as typed text and nothing else is captured.
    expect(rows.rows[0]!.message).toBe(
      "player_id=123 phone=+8801111111 otp=123456",
    );
  });

  it("limits how many reports one User may send in an hour", async () => {
    const userId = await createTestUser("feedback-limit");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await submitFeedback(pool, userId, {
        category: "bug",
        message: `Report number ${attempt + 1}.`,
        page: "/app",
      });
    }

    await expect(
      submitFeedback(pool, userId, {
        category: "bug",
        message: "One report too many.",
        page: "/app",
      }),
    ).rejects.toBeInstanceOf(FeedbackError);

    const count = await pool.query<{ count: number }>(
      `select count(*)::int as count from "feedback" where "user_id" = $1`,
      [userId],
    );
    expect(count.rows[0]!.count).toBe(5);
  });

  it("rejects a message that is too short before storing anything", async () => {
    const userId = await createTestUser("feedback-validation");
    await expect(
      submitFeedback(pool, userId, {
        category: "bug",
        message: "nope",
        page: "/app",
      }),
    ).rejects.toThrow();

    const count = await pool.query<{ count: number }>(
      `select count(*)::int as count from "feedback"`,
    );
    expect(count.rows[0]!.count).toBe(0);
  });
});
