import type { Pool, PoolClient } from "pg";

import {
  LIFECYCLE_REJECTION_MESSAGES,
  type LifecycleRejectionReason,
} from "@/domain/live";
import { deficientTeamIds } from "@/domain/matching";
import {
  bumpRevision,
  findStoredCommand,
  type LiveCommandOutcome,
  lockLiveAuction,
  rejection,
  storeCommand,
  writeAuditEntry,
} from "@/server/auction-command/live-command";
import {
  countUnresolvedBiddablePlayers,
  loadOpenUnsoldRound,
  loadTeamMinimumStates,
  loadTierProgress,
} from "@/server/auction-query/progress";
import { loadAuctionResults } from "@/server/auction-query/results";
import { loadRuleSet } from "@/server/auction-query/rules";
import { loadTiers } from "@/server/auction-query/tiers";

export interface LifecycleInput {
  actorUserId: string;
  auctionId: string;
  commandId: string;
  expectedRevision: number;
}

function reject<T>(
  reason: LifecycleRejectionReason,
  revision: number,
): LiveCommandOutcome<T> {
  return rejection(LIFECYCLE_REJECTION_MESSAGES[reason], reason, revision);
}

interface PausingPresentation {
  close_deadline: Date | null;
  id: string;
  state: string;
  warning_deadline: Date | null;
}

async function loadActivePresentation(
  client: PoolClient,
  auctionId: string,
): Promise<null | PausingPresentation> {
  const result = await client.query<PausingPresentation>(
    `select "id", "state", "warning_deadline", "close_deadline"
       from "player_presentation"
      where "auction_id" = $1 and "state" in ('open', 'closing')`,
    [auctionId],
  );
  return result.rows[0] ?? null;
}

/**
 * Suspends live action. The Active Player and the leading Bid are preserved,
 * and any running closing deadline is parked as a remaining duration so
 * Resuming can rebuild it from database time. Bids are rejected while Paused.
 */
export async function pauseAuction(
  pool: Pool,
  input: LifecycleInput,
): Promise<LiveCommandOutcome<{ pausedAt: string }>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const auction = await lockLiveAuction(client, input.auctionId);
    if (!auction || auction.organizerId !== input.actorUserId) {
      await client.query("rollback");
      return { status: "unauthorized" };
    }

    const stored = await findStoredCommand<{ pausedAt: string }>(
      client,
      input.auctionId,
      input.commandId,
    );
    if (stored) {
      await client.query("rollback");
      return stored.actorUserId === input.actorUserId
        ? {
            result: stored.result,
            revision: auction.revision,
            status: "replayed",
          }
        : { status: "unauthorized" };
    }

    if (auction.status === "paused") {
      await client.query("rollback");
      return reject("already_paused", auction.revision);
    }
    if (auction.status !== "live") {
      await client.query("rollback");
      return reject("auction_not_live", auction.revision);
    }
    if (input.expectedRevision !== auction.revision) {
      await client.query("rollback");
      return reject("stale_revision", auction.revision);
    }

    const presentation = await loadActivePresentation(client, input.auctionId);
    if (presentation) {
      const time = await client.query<{ now: Date }>(`select now() as now`);
      const now = time.rows[0]!.now.getTime();
      const deadline =
        presentation.state === "closing"
          ? presentation.warning_deadline
          : presentation.close_deadline;
      const remaining =
        deadline === null ? null : Math.max(0, deadline.getTime() - now);

      await client.query(
        `update "player_presentation"
            set "state" = 'open',
                "warning_deadline" = null,
                "close_deadline" = null,
                "paused_state" = $2,
                "paused_remaining_ms" = $3,
                "updated_at" = now()
          where "id" = $1`,
        [presentation.id, presentation.state, remaining],
      );
    }

    const paused = await client.query<{ updated_at: Date }>(
      `update "auction" set "status" = 'paused', "updated_at" = now()
        where "id" = $1
        returning "updated_at"`,
      [input.auctionId],
    );
    const pausedAt = paused.rows[0]!.updated_at.toISOString();

    const revision = await bumpRevision(
      client,
      input.auctionId,
      "auction_paused",
      {
        pausedAt,
        presentationId: presentation?.id ?? null,
      },
    );
    await writeAuditEntry(client, {
      action: "pause_auction",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: { presentationId: presentation?.id ?? null },
    });

    const result = { pausedAt };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "pause_auction",
      result,
    });
    await client.query("commit");
    return { result, revision, status: "accepted" };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Resumes a Paused Auction. A parked Timed Close deadline or Manual Close
 * warning becomes a new database deadline from the stored remaining duration;
 * an open Manual Close Presentation simply reopens.
 */
export async function resumeAuction(
  pool: Pool,
  input: LifecycleInput,
): Promise<LiveCommandOutcome<{ resumedAt: string }>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const auction = await lockLiveAuction(client, input.auctionId);
    if (!auction || auction.organizerId !== input.actorUserId) {
      await client.query("rollback");
      return { status: "unauthorized" };
    }

    const stored = await findStoredCommand<{ resumedAt: string }>(
      client,
      input.auctionId,
      input.commandId,
    );
    if (stored) {
      await client.query("rollback");
      return stored.actorUserId === input.actorUserId
        ? {
            result: stored.result,
            revision: auction.revision,
            status: "replayed",
          }
        : { status: "unauthorized" };
    }

    if (auction.status !== "paused") {
      await client.query("rollback");
      return reject("not_paused", auction.revision);
    }
    if (input.expectedRevision !== auction.revision) {
      await client.query("rollback");
      return reject("stale_revision", auction.revision);
    }

    const parked = await client.query<{
      id: string;
      paused_remaining_ms: null | number;
      paused_state: null | string;
    }>(
      `select "id", "paused_state", "paused_remaining_ms"
         from "player_presentation"
        where "auction_id" = $1 and "state" in ('open', 'closing')
          and "paused_state" is not null`,
      [input.auctionId],
    );
    const presentation = parked.rows[0];
    if (presentation) {
      if (presentation.paused_state === "closing") {
        await client.query(
          `update "player_presentation"
              set "state" = 'closing',
                  "warning_deadline" = now() + ($2 || ' milliseconds')::interval,
                  "paused_state" = null,
                  "paused_remaining_ms" = null,
                  "updated_at" = now()
            where "id" = $1`,
          [presentation.id, String(presentation.paused_remaining_ms ?? 0)],
        );
      } else if (presentation.paused_remaining_ms !== null) {
        await client.query(
          `update "player_presentation"
              set "close_deadline" = now() + ($2 || ' milliseconds')::interval,
                  "paused_state" = null,
                  "paused_remaining_ms" = null,
                  "updated_at" = now()
            where "id" = $1`,
          [presentation.id, String(presentation.paused_remaining_ms)],
        );
      } else {
        await client.query(
          `update "player_presentation"
              set "paused_state" = null, "paused_remaining_ms" = null,
                  "updated_at" = now()
            where "id" = $1`,
          [presentation.id],
        );
      }
    }

    const resumed = await client.query<{ updated_at: Date }>(
      `update "auction" set "status" = 'live', "updated_at" = now()
        where "id" = $1
        returning "updated_at"`,
      [input.auctionId],
    );
    const resumedAt = resumed.rows[0]!.updated_at.toISOString();

    const revision = await bumpRevision(
      client,
      input.auctionId,
      "auction_resumed",
      { resumedAt, presentationId: presentation?.id ?? null },
    );
    await writeAuditEntry(client, {
      action: "resume_auction",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: { presentationId: presentation?.id ?? null },
    });

    const result = { resumedAt };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "resume_auction",
      result,
    });
    await client.query("commit");
    return { result, revision, status: "accepted" };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export interface CompletionBlocker {
  reason: LifecycleRejectionReason;
}

/**
 * Checks every completion guard without changing anything, so the query layer
 * and the command agree on whether the Auction may finish.
 */
export async function findCompletionBlocker(
  client: PoolClient,
  auctionId: string,
): Promise<null | CompletionBlocker> {
  const auction = await client.query<{ rules_mode: string }>(
    `select "rules_mode" from "auction" where "id" = $1`,
    [auctionId],
  );
  const rulesMode = auction.rows[0]?.rules_mode ?? "simple";

  const active = await loadActivePresentation(client, auctionId);
  if (active) return { reason: "presentation_active" };

  const round = await loadOpenUnsoldRound(client, auctionId);
  if (round) return { reason: "unsold_round_open" };

  const tiers = await loadTiers(client, auctionId);
  const orderedTierIds = tiers.map((tier) => tier.id);

  if (rulesMode === "tiered") {
    const progress = await loadTierProgress(client, auctionId);
    if (progress.some((tier) => tier.offeredCount < tier.biddableCount)) {
      return { reason: "tier_progress_incomplete" };
    }
  }

  const unresolved = await countUnresolvedBiddablePlayers(client, auctionId);
  if (unresolved > 0) return { reason: "auction_incomplete" };

  const pool = await client.query<{ count: number }>(
    `select count(*)::int as count from "unsold_membership"
      where "auction_id" = $1 and "resolved_at" is null`,
    [auctionId],
  );
  if ((pool.rows[0]?.count ?? 0) > 0) return { reason: "unsold_pool_open" };

  const rules = await loadRuleSet(client, auctionId);
  if (rules.rosterMin === null) return { reason: "auction_incomplete" };
  const teams = await loadTeamMinimumStates(client, auctionId, orderedTierIds);
  const deficient = deficientTeamIds({
    rosterMin: rules.rosterMin,
    teams,
    tiers,
  });
  if (deficient.length > 0) return { reason: "minimums_unresolved" };

  return null;
}

/**
 * Completes the Auction once nothing is unresolved: no Active Player, no open
 * Tier, no open Unsold Round, no unresolved Unsold Pool entry, and no Team
 * below a required minimum. Completion is deliberate, so the Auction must be
 * Paused first, mirroring the documented `Live <-> Paused -> Completed`
 * lifecycle. It publishes one final authoritative Results revision and leaves
 * the Auction read-only.
 */
export async function completeAuction(
  pool: Pool,
  input: LifecycleInput,
): Promise<LiveCommandOutcome<{ completedAt: string; revision: number }>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const auction = await lockLiveAuction(client, input.auctionId);
    if (!auction || auction.organizerId !== input.actorUserId) {
      await client.query("rollback");
      return { status: "unauthorized" };
    }

    const stored = await findStoredCommand<{
      completedAt: string;
      revision: number;
    }>(client, input.auctionId, input.commandId);
    if (stored) {
      await client.query("rollback");
      return stored.actorUserId === input.actorUserId
        ? {
            result: stored.result,
            revision: auction.revision,
            status: "replayed",
          }
        : { status: "unauthorized" };
    }

    if (auction.status !== "paused") {
      await client.query("rollback");
      return reject(
        auction.status === "live" ? "auction_not_paused" : "auction_not_live",
        auction.revision,
      );
    }
    if (input.expectedRevision !== auction.revision) {
      await client.query("rollback");
      return reject("stale_revision", auction.revision);
    }

    const blocker = await findCompletionBlocker(client, input.auctionId);
    if (blocker) {
      await client.query("rollback");
      return reject(blocker.reason, auction.revision);
    }

    const results = await loadAuctionResults(client, input.auctionId);
    const updated = await client.query<{ completed_at: Date }>(
      `update "auction" set "status" = 'completed', "completed_at" = now(),
              "active_tier_id" = null, "updated_at" = now()
        where "id" = $1
        returning "completed_at"`,
      [input.auctionId],
    );
    const completedAt = updated.rows[0]!.completed_at.toISOString();

    const revision = await bumpRevision(
      client,
      input.auctionId,
      "auction_completed",
      {
        completedAt,
      },
    );
    await client.query(
      `insert into "auction_revision" ("auction_id", "revision", "payload")
       values ($1, $2, $3::jsonb)`,
      [input.auctionId, revision, JSON.stringify({ results })],
    );
    await writeAuditEntry(client, {
      action: "complete_auction",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: { revision },
    });

    const result = { completedAt, revision };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "complete_auction",
      result,
    });
    await client.query("commit");
    return { result, revision, status: "accepted" };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
