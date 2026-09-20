import type { Pool } from "pg";

/**
 * A pool or a transaction client, so a command can reuse authorized reads
 * inside its own transaction instead of duplicating queries.
 */
export type Queryable = Pick<Pool, "query">;
