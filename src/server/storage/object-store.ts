import type { Queryable } from "@/server/database/queryable";

export interface StoredObject {
  bytes: Buffer;
  contentType: string;
}

/**
 * The `ObjectStore` seam from the architecture: Team logos and generated
 * exports go behind this interface so a provider swap (Supabase Storage)
 * does not reach into the domain commands. The beta keeps the bytes in
 * PostgreSQL so one backup covers both data and objects.
 */
export async function putObject(
  db: Queryable,
  object: {
    auctionId: string;
    bytes: Uint8Array;
    contentType: string;
    key: string;
  },
): Promise<void> {
  await db.query(
    `insert into "stored_object"
        ("key", "auction_id", "content_type", "content", "byte_size")
     values ($1, $2, $3, $4, $5)`,
    [
      object.key,
      object.auctionId,
      object.contentType,
      object.bytes,
      object.bytes.byteLength,
    ],
  );
}

export async function getObject(
  db: Queryable,
  key: string,
): Promise<null | StoredObject> {
  const result = await db.query<{ content: Buffer; content_type: string }>(
    `select "content", "content_type" from "stored_object" where "key" = $1`,
    [key],
  );
  const row = result.rows[0];
  return row ? { bytes: row.content, contentType: row.content_type } : null;
}

export async function deleteObject(db: Queryable, key: string): Promise<void> {
  await db.query(`delete from "stored_object" where "key" = $1`, [key]);
}
