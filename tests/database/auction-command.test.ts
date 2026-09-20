import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import {
  createDraftAuction,
  updateDraftAuctionBasics,
} from "@/server/auction-command/auction-command";
import { getDraftAuctionForOrganizer } from "@/server/auction-query/auction-query";
import { getPool } from "@/server/database/pool";

const pool = getPool();
const testEmailPrefix = "auction-command-test-";

async function createTestUser(label: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into "user" ("id", "name", "email", "emailVerified")
     values ($1, $2, $3, true)`,
    [id, label, `${testEmailPrefix}${label}-${id}@example.com`],
  );
  return id;
}

const basics = {
  closeMode: "manual" as const,
  game: "Chess",
  rulesMode: "simple" as const,
  title: "Winter Classic",
};

afterAll(async () => {
  await pool.query(`delete from "user" where "email" like $1`, [
    `${testEmailPrefix}%`,
  ]);
});

describe("createDraftAuction", () => {
  it("creates a Draft Auction owned by the organizer", async () => {
    const organizerId = await createTestUser("create");

    const auction = await createDraftAuction(pool, organizerId, basics);

    expect(auction).toMatchObject({
      ...basics,
      organizerId,
      status: "draft",
    });
  });

  it("rejects a blank title or Game", async () => {
    const organizerId = await createTestUser("invalid");

    await expect(
      createDraftAuction(pool, organizerId, { ...basics, title: "   " }),
    ).rejects.toThrow();
    await expect(
      createDraftAuction(pool, organizerId, { ...basics, game: "" }),
    ).rejects.toThrow();
  });
});

describe("updateDraftAuctionBasics", () => {
  it("saves autosaved Basics edits for the owning Organizer", async () => {
    const organizerId = await createTestUser("edit-owner");
    const auction = await createDraftAuction(pool, organizerId, basics);

    const updated = await updateDraftAuctionBasics(
      pool,
      organizerId,
      auction.id,
      {
        closeMode: "timed",
        game: "Chess Blitz",
        rulesMode: "tiered",
        title: "Winter Classic Redux",
      },
    );

    expect(updated).toMatchObject({
      closeMode: "timed",
      game: "Chess Blitz",
      rulesMode: "tiered",
      title: "Winter Classic Redux",
    });
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(
      auction.updatedAt.getTime(),
    );
  });

  it("does not let an unrelated User edit another Organizer's Draft", async () => {
    const organizerId = await createTestUser("guarded-owner");
    const unrelatedId = await createTestUser("guarded-unrelated");
    const auction = await createDraftAuction(pool, organizerId, basics);

    const result = await updateDraftAuctionBasics(
      pool,
      unrelatedId,
      auction.id,
      { ...basics, title: "Hijacked" },
    );

    expect(result).toBeNull();
    expect(
      await getDraftAuctionForOrganizer(pool, organizerId, auction.id),
    ).toMatchObject({ title: basics.title });
  });

  it("rejects saving a blank title", async () => {
    const organizerId = await createTestUser("edit-invalid");
    const auction = await createDraftAuction(pool, organizerId, basics);

    await expect(
      updateDraftAuctionBasics(pool, organizerId, auction.id, {
        ...basics,
        title: "  ",
      }),
    ).rejects.toThrow();
  });
});
