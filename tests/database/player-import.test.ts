import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { createDraftAuction } from "@/server/auction-command/auction-command";
import { commitPlayerImport } from "@/server/auction-command/player-import";
import { createCustomPlayerField } from "@/server/auction-command/player-entries";
import { getPool } from "@/server/database/pool";
import { previewPlayerImport } from "@/server/import-export/player-import";
import { PlayerImportError } from "@/server/import-export/player-import-file";

const pool = getPool();
const testEmailPrefix = "player-import-test-";

function csvBytes(...lines: string[]): Uint8Array {
  return new TextEncoder().encode(`${lines.join("\n")}\n`);
}

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

async function entryCount(auctionId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from "player_entry" where "auction_id" = $1`,
    [auctionId],
  );
  return result.rows[0]!.count;
}

async function importCount(auctionId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from "player_import" where "auction_id" = $1`,
    [auctionId],
  );
  return result.rows[0]!.count;
}

afterAll(async () => {
  await pool.query(`delete from "user" where "email" like $1`, [
    `${testEmailPrefix}%`,
  ]);
});

describe("previewPlayerImport", () => {
  it("suggests a mapping and reports the existing Auction data", async () => {
    const { auctionId, organizerId } = await createAuction("preview");
    const field = await createCustomPlayerField(pool, organizerId, auctionId, {
      label: "Position",
    });

    const data = await previewPlayerImport(
      pool,
      organizerId,
      auctionId,
      "players.csv",
      csvBytes("Role,Name,Position", "Captain,Alice,Defender"),
    );

    expect(data).not.toBeNull();
    expect(data!.fileType).toBe("csv");
    expect(data!.worksheets[0]!.columns).toEqual(["Role", "Name", "Position"]);
    expect(data!.suggestedMappings.CSV).toEqual([
      "role",
      "displayName",
      `custom:${field!.id}`,
    ]);
    expect(data!.customFields).toEqual([{ id: field!.id, label: "Position" }]);
    expect(data!.existingDisplayNames).toEqual([]);
    expect(data!.existingExternalPlayerIds).toEqual([]);
  });

  it("returns null for an unrelated Organizer so file contents stay private", async () => {
    const owner = await createAuction("preview-owner");
    const unrelatedId = await createTestUser("preview-unrelated");

    expect(
      await previewPlayerImport(
        pool,
        unrelatedId,
        owner.auctionId,
        "players.csv",
        csvBytes("Name", "Alice"),
      ),
    ).toBeNull();
  });
});

describe("commitPlayerImport", () => {
  it("creates every accepted row and its custom values in one commit", async () => {
    const { auctionId, organizerId } = await createAuction("commit");
    const field = await createCustomPlayerField(pool, organizerId, auctionId, {
      label: "Position",
    });

    const result = await commitPlayerImport(
      pool,
      organizerId,
      auctionId,
      "players.csv",
      csvBytes(
        "Player Name,Role,External Player ID,Phone,Position",
        "Alice,Captain,uid-1,+1 555 010 2030,Defender",
        "Bob,,,",
      ),
      {
        commandId: randomUUID(),
        mapping: [
          "displayName",
          "role",
          "externalPlayerId",
          "phoneNumber",
          `custom:${field!.id}`,
        ],
        worksheetName: "CSV",
      },
    );

    expect(result).toMatchObject({ duplicate: false, importedCount: 2 });
    const entries = await pool.query(
      `select "display_name", "external_player_id", "phone_number", "role"
         from "player_entry" where "auction_id" = $1 order by "display_name"`,
      [auctionId],
    );
    expect(entries.rows).toEqual([
      {
        display_name: "Alice",
        external_player_id: "uid-1",
        phone_number: "+1 555 010 2030",
        role: "Captain",
      },
      {
        display_name: "Bob",
        external_player_id: null,
        phone_number: null,
        role: null,
      },
    ]);

    const values = await pool.query<{ value: string }>(
      `select "value" from "player_entry_custom_value"
        where "custom_player_field_id" = $1`,
      [field!.id],
    );
    expect(values.rows).toEqual([{ value: "Defender" }]);
  });

  it("reads a worksheet chosen from a multi-sheet workbook", async () => {
    const { auctionId, organizerId } = await createAuction("worksheet");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Name"], ["Ignored"]]),
      "First",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Player Name"], ["Alice"]]),
      "Roster",
    );
    const bytes = new Uint8Array(
      XLSX.write(workbook, { bookType: "xlsx", type: "array" }),
    );

    const result = await commitPlayerImport(
      pool,
      organizerId,
      auctionId,
      "players.xlsx",
      bytes,
      {
        commandId: randomUUID(),
        mapping: ["displayName"],
        worksheetName: "Roster",
      },
    );

    expect(result?.importedCount).toBe(1);
    const entries = await pool.query<{ display_name: string }>(
      `select "display_name" from "player_entry" where "auction_id" = $1`,
      [auctionId],
    );
    expect(entries.rows).toEqual([{ display_name: "Alice" }]);
  });

  it("warns about duplicate display names but still imports them", async () => {
    const { auctionId, organizerId } = await createAuction("duplicates");

    const result = await commitPlayerImport(
      pool,
      organizerId,
      auctionId,
      "players.csv",
      csvBytes("Name", "Alice", "  alice "),
      {
        commandId: randomUUID(),
        mapping: ["displayName"],
        worksheetName: "CSV",
      },
    );

    expect(result).toMatchObject({ importedCount: 2, warningCount: 1 });
    expect(await entryCount(auctionId)).toBe(2);
  });

  it("treats a repeated command ID as the same import", async () => {
    const { auctionId, organizerId } = await createAuction("idempotent");
    const commandId = randomUUID();
    const selection = {
      commandId,
      mapping: ["displayName"],
      worksheetName: "CSV",
    };

    const first = await commitPlayerImport(
      pool,
      organizerId,
      auctionId,
      "players.csv",
      csvBytes("Name", "Alice", "Bob"),
      selection,
    );
    const second = await commitPlayerImport(
      pool,
      organizerId,
      auctionId,
      "players.csv",
      csvBytes("Name", "Different", "File"),
      selection,
    );

    expect(first).toMatchObject({ duplicate: false, importedCount: 2 });
    expect(second).toMatchObject({ duplicate: true, importedCount: 2 });
    expect(await entryCount(auctionId)).toBe(2);
    expect(await importCount(auctionId)).toBe(1);
  });

  it("imports nothing when any row is invalid", async () => {
    const { auctionId, organizerId } = await createAuction("rollback-rows");

    await expect(
      commitPlayerImport(
        pool,
        organizerId,
        auctionId,
        "players.csv",
        csvBytes("Name,Phone", "Alice,+15550102030", "Bob,nope"),
        {
          commandId: randomUUID(),
          mapping: ["displayName", "phoneNumber"],
          worksheetName: "CSV",
        },
      ),
    ).rejects.toThrow(PlayerImportError);

    expect(await entryCount(auctionId)).toBe(0);
    expect(await importCount(auctionId)).toBe(0);
  });

  it("imports nothing when the Auction would exceed 2,000 Player Entries", async () => {
    const { auctionId, organizerId } = await createAuction("rollback-cap");
    await pool.query(
      `insert into "player_entry" ("auction_id", "display_name")
       select $1, 'Player ' || g from generate_series(1, 2000) as g`,
      [auctionId],
    );

    await expect(
      commitPlayerImport(
        pool,
        organizerId,
        auctionId,
        "players.csv",
        csvBytes("Name", "One Too Many"),
        {
          commandId: randomUUID(),
          mapping: ["displayName"],
          worksheetName: "CSV",
        },
      ),
    ).rejects.toThrow("would exceed");

    expect(await entryCount(auctionId)).toBe(2000);
    expect(await importCount(auctionId)).toBe(0);
  });

  it("imports nothing when an External Player ID is already used", async () => {
    const { auctionId, organizerId } = await createAuction("rollback-external");
    await pool.query(
      `insert into "player_entry" ("auction_id", "display_name", "external_player_id")
       values ($1, 'Existing', 'uid-1')`,
      [auctionId],
    );

    await expect(
      commitPlayerImport(
        pool,
        organizerId,
        auctionId,
        "players.csv",
        csvBytes("Name,External Player ID", "Alice,uid-2", "Bob,uid-1"),
        {
          commandId: randomUUID(),
          mapping: ["displayName", "externalPlayerId"],
          worksheetName: "CSV",
        },
      ),
    ).rejects.toThrow(PlayerImportError);

    expect(await entryCount(auctionId)).toBe(1);
    expect(await importCount(auctionId)).toBe(0);
  });

  it("refuses a mapping that does not match the file", async () => {
    const { auctionId, organizerId } = await createAuction("bad-mapping");

    await expect(
      commitPlayerImport(
        pool,
        organizerId,
        auctionId,
        "players.csv",
        csvBytes("Name", "Alice"),
        {
          commandId: randomUUID(),
          mapping: [],
          worksheetName: "CSV",
        },
      ),
    ).rejects.toThrow(PlayerImportError);

    await expect(
      commitPlayerImport(
        pool,
        organizerId,
        auctionId,
        "players.csv",
        csvBytes("Name", "Alice"),
        {
          commandId: randomUUID(),
          mapping: ["displayName"],
          worksheetName: "Missing",
        },
      ),
    ).rejects.toThrow(PlayerImportError);

    expect(await entryCount(auctionId)).toBe(0);
  });

  it("returns null for an unrelated Organizer and writes nothing", async () => {
    const owner = await createAuction("commit-owner");
    const unrelatedId = await createTestUser("commit-unrelated");

    const result = await commitPlayerImport(
      pool,
      unrelatedId,
      owner.auctionId,
      "players.csv",
      csvBytes("Name", "Intruder"),
      {
        commandId: randomUUID(),
        mapping: ["displayName"],
        worksheetName: "CSV",
      },
    );

    expect(result).toBeNull();
    expect(await entryCount(owner.auctionId)).toBe(0);
  });

  it("returns null once the Auction is no longer editable", async () => {
    const { auctionId, organizerId } = await createAuction("commit-ready");
    await pool.query(
      `update "auction" set "status" = 'completed' where "id" = $1`,
      [auctionId],
    );

    expect(
      await commitPlayerImport(
        pool,
        organizerId,
        auctionId,
        "players.csv",
        csvBytes("Name", "Alice"),
        {
          commandId: randomUUID(),
          mapping: ["displayName"],
          worksheetName: "CSV",
        },
      ),
    ).toBeNull();
    expect(await entryCount(auctionId)).toBe(0);
  });
});
