import type { Pool, PoolClient } from "pg";

import {
  AdministrationError,
  auctionModerationInputSchema,
  inspectAuctionInputSchema,
  MODERATION_REASON_MAX,
  revokeSessionsInputSchema,
  restoreUserInputSchema,
  suspendUserInputSchema,
  type ModerationAction,
} from "@/domain/administration";
import { isPlatformAdministrator } from "@/server/auction-query/administration";

export interface ModerationRecordResult {
  action: ModerationAction;
  at: string;
}

interface ModerationActor {
  actorUserId: string;
  client: PoolClient;
}

/**
 * Confirms the actor is a Platform Administrator inside the caller's
 * transaction. Administrator status is read from the database, never from the
 * request, and an ordinary registration or Auction ownership can never grant
 * it.
 */
async function requireAdministrator({
  actorUserId,
  client,
}: ModerationActor): Promise<boolean> {
  return isPlatformAdministrator(client, actorUserId);
}

/** Writes the immutable moderation record every administrator action needs. */
async function recordModeration(
  client: PoolClient,
  {
    action,
    actorUserId,
    auctionId = null,
    reason,
  }: {
    action: ModerationAction;
    actorUserId: string;
    auctionId?: null | string;
    reason: string;
  },
): Promise<string> {
  const inserted = await client.query<{ server_time: Date }>(
    `insert into "moderation_access_entry"
        ("actor_user_id", "auction_id", "action", "reason")
     values ($1, $2, $3, $4)
     returning "server_time"`,
    [actorUserId, auctionId, action, reason],
  );
  return inserted.rows[0]!.server_time.toISOString();
}

async function revokeAllSessions(
  client: PoolClient,
  userId: string,
): Promise<number> {
  const deleted = await client.query(
    `delete from "session" where "userId" = $1`,
    [userId],
  );
  return deleted.rowCount ?? 0;
}

/**
 * Suspends a User and revokes every active session in one transaction. A
 * suspended User cannot establish a new session, and their existing sessions
 * stop resolving, so an open tab loses access on its next protected action.
 *
 * Returns null when the actor is not a Platform Administrator.
 */
export async function suspendUser(
  pool: Pool,
  actorUserId: string,
  input: { reason: string; userId: string },
): Promise<null | ModerationRecordResult> {
  const parsed = suspendUserInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await requireAdministrator({ actorUserId, client }))) {
      await client.query("rollback");
      return null;
    }

    const target = await client.query(
      `select 1 from "user" where "id" = $1 for update`,
      [parsed.userId],
    );
    if (!target.rowCount) {
      await client.query("rollback");
      throw new AdministrationError("That User no longer exists.");
    }

    const active = await client.query(
      `select 1 from "user_suspension"
        where "user_id" = $1 and "restored_at" is null`,
      [parsed.userId],
    );
    if (active.rowCount && active.rowCount > 0) {
      await client.query("rollback");
      throw new AdministrationError("That User is already suspended.");
    }

    await client.query(
      `insert into "user_suspension" ("user_id", "reason", "suspended_by_user_id")
       values ($1, $2, $3)`,
      [parsed.userId, parsed.reason, actorUserId],
    );
    await revokeAllSessions(client, parsed.userId);
    const at = await recordModeration(client, {
      action: "suspend_user",
      actorUserId,
      reason: parsed.reason,
    });
    await client.query("commit");
    return { action: "suspend_user", at };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Lifts a User's suspension. Earlier suspensions stay in the history. */
export async function restoreUser(
  pool: Pool,
  actorUserId: string,
  input: { reason: string; userId: string },
): Promise<null | ModerationRecordResult> {
  const parsed = restoreUserInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await requireAdministrator({ actorUserId, client }))) {
      await client.query("rollback");
      return null;
    }

    const restored = await client.query(
      `update "user_suspension"
          set "restored_at" = now(), "restored_by_user_id" = $2
        where "user_id" = $1 and "restored_at" is null`,
      [parsed.userId, actorUserId],
    );
    if (restored.rowCount !== 1) {
      await client.query("rollback");
      throw new AdministrationError("That User is not suspended.");
    }

    const at = await recordModeration(client, {
      action: "restore_user",
      actorUserId,
      reason: parsed.reason,
    });
    await client.query("commit");
    return { action: "restore_user", at };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Revokes every active session for a User without suspending them. */
export async function revokeUserSessions(
  pool: Pool,
  actorUserId: string,
  input: { reason: string; userId: string },
): Promise<null | (ModerationRecordResult & { revokedCount: number })> {
  const parsed = revokeSessionsInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await requireAdministrator({ actorUserId, client }))) {
      await client.query("rollback");
      return null;
    }

    const revokedCount = await revokeAllSessions(client, parsed.userId);
    const at = await recordModeration(client, {
      action: "revoke_sessions",
      actorUserId,
      reason: parsed.reason,
    });
    await client.query("commit");
    return { action: "revoke_sessions", at, revokedCount };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Hides an Auction. Its domain records are untouched: it simply stops being
 * readable or controllable by Organizers, Representatives, and unrelated Users
 * until it is unhidden.
 */
export async function hideAuction(
  pool: Pool,
  actorUserId: string,
  input: { auctionId: string; reason: string },
): Promise<null | ModerationRecordResult> {
  const parsed = auctionModerationInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await requireAdministrator({ actorUserId, client }))) {
      await client.query("rollback");
      return null;
    }

    const updated = await client.query(
      `update "auction"
          set "hidden_at" = now(), "hidden_by_user_id" = $2,
              "hidden_reason" = $3, "updated_at" = now()
        where "id" = $1 and "hidden_at" is null`,
      [parsed.auctionId, actorUserId, parsed.reason],
    );
    if (updated.rowCount !== 1) {
      await client.query("rollback");
      throw new AdministrationError(
        "That Auction does not exist or is already hidden.",
      );
    }

    const at = await recordModeration(client, {
      action: "hide_auction",
      actorUserId,
      auctionId: parsed.auctionId,
      reason: parsed.reason,
    });
    await client.query("commit");
    return { action: "hide_auction", at };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Unhides an Auction, returning it to the access its participants had. */
export async function unhideAuction(
  pool: Pool,
  actorUserId: string,
  input: { auctionId: string; reason: string },
): Promise<null | ModerationRecordResult> {
  const parsed = auctionModerationInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await requireAdministrator({ actorUserId, client }))) {
      await client.query("rollback");
      return null;
    }

    const updated = await client.query(
      `update "auction"
          set "hidden_at" = null, "hidden_by_user_id" = null,
              "hidden_reason" = null, "updated_at" = now()
        where "id" = $1 and "hidden_at" is not null`,
      [parsed.auctionId],
    );
    if (updated.rowCount !== 1) {
      await client.query("rollback");
      throw new AdministrationError(
        "That Auction does not exist or is not hidden.",
      );
    }

    const at = await recordModeration(client, {
      action: "unhide_auction",
      actorUserId,
      auctionId: parsed.auctionId,
      reason: parsed.reason,
    });
    await client.query("commit");
    return { action: "unhide_auction", at };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Records a reason-gated inspection and returns nothing but the fact it
 * happened. Reading the summary is a separate authorized query, so the record
 * exists before any protected data is shown.
 */
export async function recordModerationInspection(
  pool: Pool,
  actorUserId: string,
  input: { auctionId: string; reason: string },
): Promise<null | ModerationRecordResult> {
  const parsed = inspectAuctionInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await requireAdministrator({ actorUserId, client }))) {
      await client.query("rollback");
      return null;
    }

    const auction = await client.query(
      `select 1 from "auction" where "id" = $1`,
      [parsed.auctionId],
    );
    if (!auction.rowCount) {
      await client.query("rollback");
      throw new AdministrationError("That Auction no longer exists.");
    }

    const at = await recordModeration(client, {
      action: "inspect_auction",
      actorUserId,
      auctionId: parsed.auctionId,
      reason: parsed.reason,
    });
    await client.query("commit");
    return { action: "inspect_auction", at };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export interface BootstrapInput {
  note?: string;
  userId: string;
}

/**
 * Provisions the very first Platform Administrator. It succeeds only while no
 * administrator exists, so the temporary bootstrap value stops working once the
 * role has been granted; a later run is refused rather than adding another
 * administrator.
 */
export async function bootstrapAdministrator(
  pool: Pool,
  input: BootstrapInput,
): Promise<ModerationRecordResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query<{ count: number }>(
      `select count(*)::int as count from "platform_administrator"`,
    );
    if (existing.rows[0]!.count > 0) {
      await client.query("rollback");
      throw new AdministrationError(
        "A Platform Administrator already exists. Remove the bootstrap value and grant the role in the database.",
      );
    }

    const user = await client.query(`select 1 from "user" where "id" = $1`, [
      input.userId,
    ]);
    if (!user.rowCount) {
      await client.query("rollback");
      throw new AdministrationError(
        "No registered User matches the bootstrap email.",
      );
    }

    await client.query(
      `insert into "platform_administrator" ("user_id", "note") values ($1, $2)`,
      [input.userId, input.note ?? null],
    );
    const at = await recordModeration(client, {
      action: "bootstrap_administrator",
      actorUserId: input.userId,
      reason:
        "Initial Platform Administrator provisioned from the bootstrap value.",
    });
    await client.query("commit");
    return { action: "bootstrap_administrator", at };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** The moderation reason limit, re-exported for the administration UI. */
export const MODERATION_REASON_LIMIT = MODERATION_REASON_MAX;
