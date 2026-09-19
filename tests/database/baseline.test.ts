import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

afterAll(async () => {
  await sql.end();
});

describe("database foundation", () => {
  it("connects to PostgreSQL with the baseline migration applied", async () => {
    const migrations = await sql<{ version: string }[]>`
      select version
      from supabase_migrations.schema_migrations
      where version = '20260919114916'
    `;

    expect(migrations).toEqual([{ version: "20260919114916" }]);
  });
});
