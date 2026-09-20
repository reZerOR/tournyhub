import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { archiveAuction } from "@/server/auction-command/archive";
import { createDraftAuction } from "@/server/auction-command/auction-command";
import {
  getArchivedAuctions,
  getDraftAuctionForOrganizer,
  getOrganizerAuctions,
} from "@/server/auction-query/auction-query";
import { getPool } from "@/server/database/pool";

const pool = getPool();
const testEmailPrefix = "auction-query-test-";

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

describe("getOrganizerAuctions and getArchivedAuctions", () => {
  it("separates an organizer's Draft Auctions from another organizer's and from archived ones", async () => {
    const organizerId = await createTestUser("list-owner");
    const otherOrganizerId = await createTestUser("list-other");

    const ownAuction = await createDraftAuction(pool, organizerId, basics);
    await createDraftAuction(pool, otherOrganizerId, basics);
    // Archiving goes through the real command, which is the only path that
    // records the previous state and the recovery deadline.
    await archiveAuction(pool, organizerId, ownAuction.id);
    const activeAuction = await createDraftAuction(pool, organizerId, {
      ...basics,
      title: "Spring Classic",
    });

    const active = await getOrganizerAuctions(pool, organizerId);
    expect(active.map((auction) => auction.id)).toEqual([activeAuction.id]);

    const archived = await getArchivedAuctions(pool, organizerId);
    expect(archived.map((auction) => auction.id)).toEqual([ownAuction.id]);
  });
});

describe("getDraftAuctionForOrganizer", () => {
  it("returns null for an unrelated User instead of leaking the Auction", async () => {
    const organizerId = await createTestUser("owner");
    const unrelatedId = await createTestUser("unrelated");
    const auction = await createDraftAuction(pool, organizerId, basics);

    expect(
      await getDraftAuctionForOrganizer(pool, unrelatedId, auction.id),
    ).toBeNull();
    expect(
      await getDraftAuctionForOrganizer(pool, organizerId, auction.id),
    ).toMatchObject({ id: auction.id });
  });

  it("returns null for an Auction that is no longer a Draft", async () => {
    const organizerId = await createTestUser("non-draft");
    const auction = await createDraftAuction(pool, organizerId, basics);
    await pool.query(
      `update "auction" set "status" = 'ready' where "id" = $1`,
      [auction.id],
    );

    expect(
      await getDraftAuctionForOrganizer(pool, organizerId, auction.id),
    ).toBeNull();
  });
});
