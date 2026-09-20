import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import {
  createCustomPlayerField,
  createPlayerEntry,
  deleteCustomPlayerField,
  deletePlayerEntry,
  PlayerSetupError,
  updateCustomPlayerField,
  updatePlayerEntry,
} from "@/server/auction-command/player-entries";
import { createDraftAuction } from "@/server/auction-command/auction-command";
import {
  getCustomPlayerFieldsForOrganizer,
  getPlayerEntriesForOrganizer,
} from "@/server/auction-query/player-entries";
import { getPool } from "@/server/database/pool";

const pool = getPool();
const testEmailPrefix = "player-entries-test-";

async function createTestUser(label: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into "user" ("id", "name", "email", "emailVerified")
     values ($1, $2, $3, true)`,
    [id, label, `${testEmailPrefix}${label}-${id}@example.com`],
  );
  return id;
}

async function createAuction(
  label: string,
): Promise<{ auctionId: string; organizerId: string }> {
  const organizerId = await createTestUser(label);
  const auction = await createDraftAuction(pool, organizerId, {
    closeMode: "manual",
    game: "Chess",
    rulesMode: "simple",
    title: "Winter Classic",
  });
  return { auctionId: auction.id, organizerId };
}

afterAll(async () => {
  await pool.query(`delete from "user" where "email" like $1`, [
    `${testEmailPrefix}%`,
  ]);
});

describe("createPlayerEntry", () => {
  it("creates a Player Entry with a display name alone", async () => {
    const { auctionId, organizerId } = await createAuction("minimal");

    const entry = await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "  Alice  ",
    });

    expect(entry).toMatchObject({
      auctionId,
      customValues: {},
      displayName: "Alice",
      externalPlayerId: null,
      phoneNumber: null,
      role: null,
      startingPriceOverride: null,
    });
  });

  it("stores optional fields and custom values", async () => {
    const { auctionId, organizerId } = await createAuction("optional");
    const field = await createCustomPlayerField(pool, organizerId, auctionId, {
      label: "Position",
    });

    const entry = await createPlayerEntry(pool, organizerId, auctionId, {
      customValues: { [field!.id]: "Defender" },
      displayName: "Alice",
      externalPlayerId: "uid-1",
      phoneNumber: "+1 555 010 2030",
      role: "Goalkeeper",
      startingPriceOverride: 25,
    });

    expect(entry).toMatchObject({
      customValues: { [field!.id]: "Defender" },
      externalPlayerId: "uid-1",
      phoneNumber: "+1 555 010 2030",
      role: "Goalkeeper",
      startingPriceOverride: 25,
    });
  });

  it("rejects invalid field values", async () => {
    const { auctionId, organizerId } = await createAuction("invalid");

    await expect(
      createPlayerEntry(pool, organizerId, auctionId, { displayName: "   " }),
    ).rejects.toThrow();
    await expect(
      createPlayerEntry(pool, organizerId, auctionId, {
        displayName: "a".repeat(101),
      }),
    ).rejects.toThrow();
    await expect(
      createPlayerEntry(pool, organizerId, auctionId, {
        displayName: "Alice",
        startingPriceOverride: 0,
      }),
    ).rejects.toThrow();
    await expect(
      createPlayerEntry(pool, organizerId, auctionId, {
        displayName: "Alice",
        phoneNumber: "not a phone",
      }),
    ).rejects.toThrow();
  });

  it("keeps External Player IDs unique within one Auction but reusable in another", async () => {
    const first = await createAuction("external-first");
    const second = await createAuction("external-second");

    await createPlayerEntry(pool, first.organizerId, first.auctionId, {
      displayName: "Alice",
      externalPlayerId: "uid-1",
    });

    await expect(
      createPlayerEntry(pool, first.organizerId, first.auctionId, {
        displayName: "Bob",
        externalPlayerId: "uid-1",
      }),
    ).rejects.toThrow(PlayerSetupError);

    const reused = await createPlayerEntry(
      pool,
      second.organizerId,
      second.auctionId,
      { displayName: "Alice", externalPlayerId: "uid-1" },
    );
    expect(reused).toMatchObject({ externalPlayerId: "uid-1" });
  });

  it("saves duplicate normalized display names", async () => {
    const { auctionId, organizerId } = await createAuction("duplicates");

    await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "Alice",
    });
    const second = await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "  alice ",
    });

    expect(second).not.toBeNull();
    const entries = await getPlayerEntriesForOrganizer(
      pool,
      organizerId,
      auctionId,
    );
    expect(entries).toHaveLength(2);
  });

  it("refuses to exceed 2,000 Player Entries", async () => {
    const { auctionId, organizerId } = await createAuction("cap");
    await pool.query(
      `insert into "player_entry" ("auction_id", "display_name")
       select $1, 'Player ' || g from generate_series(1, 2000) as g`,
      [auctionId],
    );

    await expect(
      createPlayerEntry(pool, organizerId, auctionId, {
        displayName: "One Too Many",
      }),
    ).rejects.toThrow(PlayerSetupError);

    const count = await pool.query<{ count: number }>(
      `select count(*)::int as count from "player_entry" where "auction_id" = $1`,
      [auctionId],
    );
    expect(count.rows[0]!.count).toBe(2000);
  });

  it("returns null for an unrelated Organizer and writes nothing", async () => {
    const owner = await createAuction("create-owner");
    const unrelatedId = await createTestUser("create-unrelated");

    const result = await createPlayerEntry(pool, unrelatedId, owner.auctionId, {
      displayName: "Intruder",
    });

    expect(result).toBeNull();
    expect(
      await getPlayerEntriesForOrganizer(
        pool,
        owner.organizerId,
        owner.auctionId,
      ),
    ).toEqual([]);
  });

  it("returns null once the Auction is no longer editable", async () => {
    const { auctionId, organizerId } = await createAuction("create-ready");
    await pool.query(
      `update "auction" set "status" = 'completed' where "id" = $1`,
      [auctionId],
    );

    expect(
      await createPlayerEntry(pool, organizerId, auctionId, {
        displayName: "Alice",
      }),
    ).toBeNull();
  });

  it("still edits a Ready Auction and returns it to Draft", async () => {
    const { auctionId, organizerId } = await createAuction("create-ready-edit");
    await pool.query(
      `update "auction" set "status" = 'ready' where "id" = $1`,
      [auctionId],
    );

    expect(
      await createPlayerEntry(pool, organizerId, auctionId, {
        displayName: "Alice",
      }),
    ).not.toBeNull();

    const status = await pool.query<{ status: string }>(
      `select "status" from "auction" where "id" = $1`,
      [auctionId],
    );
    expect(status.rows[0]!.status).toBe("draft");
  });
});

describe("updatePlayerEntry and deletePlayerEntry", () => {
  it("replaces fields and custom values", async () => {
    const { auctionId, organizerId } = await createAuction("update");
    const field = await createCustomPlayerField(pool, organizerId, auctionId, {
      label: "Position",
    });
    const entry = await createPlayerEntry(pool, organizerId, auctionId, {
      customValues: { [field!.id]: "Defender" },
      displayName: "Alice",
      role: "Goalkeeper",
    });

    const updated = await updatePlayerEntry(
      pool,
      organizerId,
      auctionId,
      entry!.id,
      {
        customValues: { [field!.id]: "Midfielder" },
        displayName: "Alice Smith",
        externalPlayerId: "uid-9",
        startingPriceOverride: 40,
      },
    );

    expect(updated).toMatchObject({
      customValues: { [field!.id]: "Midfielder" },
      displayName: "Alice Smith",
      externalPlayerId: "uid-9",
      role: null,
      startingPriceOverride: 40,
    });
  });

  it("keeps its own External Player ID and rejects another entry's", async () => {
    const { auctionId, organizerId } = await createAuction("update-external");
    const first = await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "Alice",
      externalPlayerId: "uid-1",
    });
    const second = await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "Bob",
      externalPlayerId: "uid-2",
    });

    expect(
      await updatePlayerEntry(pool, organizerId, auctionId, first!.id, {
        displayName: "Alice",
        externalPlayerId: "uid-1",
      }),
    ).not.toBeNull();

    await expect(
      updatePlayerEntry(pool, organizerId, auctionId, second!.id, {
        displayName: "Bob",
        externalPlayerId: "uid-1",
      }),
    ).rejects.toThrow(PlayerSetupError);
  });

  it("returns null for an unrelated Organizer or a foreign entry", async () => {
    const owner = await createAuction("update-owner");
    const unrelatedId = await createTestUser("update-unrelated");
    const entry = await createPlayerEntry(
      pool,
      owner.organizerId,
      owner.auctionId,
      {
        displayName: "Alice",
      },
    );

    expect(
      await updatePlayerEntry(pool, unrelatedId, owner.auctionId, entry!.id, {
        displayName: "Hijacked",
      }),
    ).toBeNull();

    expect(
      await updatePlayerEntry(
        pool,
        owner.organizerId,
        owner.auctionId,
        randomUUID(),
        { displayName: "Ghost" },
      ),
    ).toBeNull();
  });

  it("removes the entry and its custom values", async () => {
    const { auctionId, organizerId } = await createAuction("delete");
    const field = await createCustomPlayerField(pool, organizerId, auctionId, {
      label: "Position",
    });
    const entry = await createPlayerEntry(pool, organizerId, auctionId, {
      customValues: { [field!.id]: "Defender" },
      displayName: "Alice",
    });

    expect(
      await deletePlayerEntry(pool, organizerId, auctionId, entry!.id),
    ).toBe(true);

    const values = await pool.query(
      `select 1 from "player_entry_custom_value" where "player_entry_id" = $1`,
      [entry!.id],
    );
    expect(values.rowCount).toBe(0);
    expect(
      await getPlayerEntriesForOrganizer(pool, organizerId, auctionId),
    ).toEqual([]);
  });

  it("returns false when an unrelated Organizer deletes", async () => {
    const owner = await createAuction("delete-owner");
    const unrelatedId = await createTestUser("delete-unrelated");
    const entry = await createPlayerEntry(
      pool,
      owner.organizerId,
      owner.auctionId,
      {
        displayName: "Alice",
      },
    );

    expect(
      await deletePlayerEntry(pool, unrelatedId, owner.auctionId, entry!.id),
    ).toBe(false);
    expect(
      await getPlayerEntriesForOrganizer(
        pool,
        owner.organizerId,
        owner.auctionId,
      ),
    ).toHaveLength(1);
  });
});

describe("custom player fields", () => {
  it("creates, renames, and removes a field with its values", async () => {
    const { auctionId, organizerId } = await createAuction("fields");
    const field = await createCustomPlayerField(pool, organizerId, auctionId, {
      label: "  Position ",
    });
    expect(field).toMatchObject({ auctionId, label: "Position" });

    const renamed = await updateCustomPlayerField(
      pool,
      organizerId,
      auctionId,
      field!.id,
      { label: "Primary position" },
    );
    expect(renamed).toMatchObject({ label: "Primary position" });

    const entry = await createPlayerEntry(pool, organizerId, auctionId, {
      customValues: { [field!.id]: "Defender" },
      displayName: "Alice",
    });
    expect(
      await deleteCustomPlayerField(pool, organizerId, auctionId, field!.id),
    ).toBe(true);

    const values = await pool.query(
      `select 1 from "player_entry_custom_value" where "player_entry_id" = $1`,
      [entry!.id],
    );
    expect(values.rowCount).toBe(0);
  });

  it("refuses a value for a field from another Auction", async () => {
    const first = await createAuction("value-first");
    const second = await createAuction("value-second");
    const foreignField = await createCustomPlayerField(
      pool,
      first.organizerId,
      first.auctionId,
      { label: "Position" },
    );

    await expect(
      createPlayerEntry(pool, second.organizerId, second.auctionId, {
        customValues: { [foreignField!.id]: "Defender" },
        displayName: "Alice",
      }),
    ).rejects.toThrow(PlayerSetupError);
  });

  it("refuses to exceed 20 Custom Player Fields", async () => {
    const { auctionId, organizerId } = await createAuction("field-cap");
    await pool.query(
      `insert into "custom_player_field" ("auction_id", "label")
       select $1, 'Field ' || g from generate_series(1, 20) as g`,
      [auctionId],
    );

    await expect(
      createCustomPlayerField(pool, organizerId, auctionId, {
        label: "One more",
      }),
    ).rejects.toThrow(PlayerSetupError);
  });

  it("returns null for an unrelated Organizer", async () => {
    const owner = await createAuction("field-owner");
    const unrelatedId = await createTestUser("field-unrelated");

    expect(
      await createCustomPlayerField(pool, unrelatedId, owner.auctionId, {
        label: "Position",
      }),
    ).toBeNull();
    expect(
      await updateCustomPlayerField(
        pool,
        unrelatedId,
        owner.auctionId,
        randomUUID(),
        { label: "Position" },
      ),
    ).toBeNull();
    expect(
      await deleteCustomPlayerField(
        pool,
        unrelatedId,
        owner.auctionId,
        randomUUID(),
      ),
    ).toBe(false);
  });
});

describe("reading Player setup", () => {
  it("returns saved entries and fields with their custom values", async () => {
    const { auctionId, organizerId } = await createAuction("read");
    const field = await createCustomPlayerField(pool, organizerId, auctionId, {
      label: "Position",
    });
    await createPlayerEntry(pool, organizerId, auctionId, {
      customValues: { [field!.id]: "Defender" },
      displayName: "Alice",
      phoneNumber: "+1 555 010 2030",
    });

    const fields = await getCustomPlayerFieldsForOrganizer(
      pool,
      organizerId,
      auctionId,
    );
    const entries = await getPlayerEntriesForOrganizer(
      pool,
      organizerId,
      auctionId,
    );

    expect(fields).toHaveLength(1);
    expect(entries).toHaveLength(1);
    expect(entries![0]).toMatchObject({
      customValues: { [field!.id]: "Defender" },
      displayName: "Alice",
      phoneNumber: "+1 555 010 2030",
    });
  });

  it("returns null for an unrelated Organizer so private contact data stays private", async () => {
    const owner = await createAuction("read-owner");
    const unrelatedId = await createTestUser("read-unrelated");
    await createPlayerEntry(pool, owner.organizerId, owner.auctionId, {
      displayName: "Alice",
      phoneNumber: "+1 555 010 2030",
    });

    expect(
      await getPlayerEntriesForOrganizer(pool, unrelatedId, owner.auctionId),
    ).toBeNull();
    expect(
      await getCustomPlayerFieldsForOrganizer(
        pool,
        unrelatedId,
        owner.auctionId,
      ),
    ).toBeNull();
  });
});
