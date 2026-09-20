import type { Pool, PoolClient } from "pg";

import {
  CLOSE_REJECTION_MESSAGES,
  type CloseRejectionReason,
  type PresentationOutcome,
} from "@/domain/live";
import {
  bumpRevision,
  findStoredCommand,
  type LiveCommandOutcome,
  lockLiveAuction,
  storeCommand,
  writeAuditEntry,
} from "@/server/auction-command/live-command";

/** The Manual Close warning lasts three seconds from database time. */
export const MANUAL_CLOSE_WARNING_SECONDS = 3;

interface PresentationRow {
  close_deadline: Date | null;
  id: string;
  player_entry_id: string;
  state: string;
  tier_id: null | string;
  warning_deadline: Date | null;
}

async function loadPresentation(
  client: PoolClient,
  auctionId: string,
  presentationId: string,
): Promise<null | PresentationRow> {
  const result = await client.query<PresentationRow>(
    `select "id", "player_entry_id", "tier_id", "state", "warning_deadline",
            "close_deadline"
       from "player_presentation" where "id" = $1 and "auction_id" = $2`,
    [presentationId, auctionId],
  );
  return result.rows[0] ?? null;
}

export interface QuickCloseInput {
  actorUserId: string;
  auctionId: string;
  commandId: string;
  expectedRevision: number;
  presentationId: string;
}

/** Starts the three-second Manual Close warning for the Active Player. */
export async function beginManualClose(
  pool: Pool,
  input: QuickCloseInput,
): Promise<LiveCommandOutcome<{ warningDeadline: string }>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const auction = await lockLiveAuction(client, input.auctionId);
    if (!auction || auction.organizerId !== input.actorUserId) {
      await client.query("rollback");
      return { status: "unauthorized" };
    }
    const stored = await findStoredCommand<{ warningDeadline: string }>(
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
    if (auction.status !== "live") {
      await client.query("rollback");
      return closeReject("auction_not_live", auction.revision);
    }
    if (auction.closeMode !== "manual") {
      await client.query("rollback");
      return closeReject("not_manual_close", auction.revision);
    }
    if (input.expectedRevision !== auction.revision) {
      await client.query("rollback");
      return closeReject("stale_revision", auction.revision);
    }

    const presentation = await loadPresentation(
      client,
      input.auctionId,
      input.presentationId,
    );
    if (!presentation || presentation.state !== "open") {
      await client.query("rollback");
      return closeReject(
        presentation?.state === "closing"
          ? "already_closing"
          : "presentation_missing",
        auction.revision,
      );
    }

    const updated = await client.query<{ warning_deadline: Date }>(
      `update "player_presentation"
          set "state" = 'closing',
              "warning_deadline" = now() + ($2 || ' seconds')::interval,
              "updated_at" = now()
        where "id" = $1
        returning "warning_deadline"`,
      [input.presentationId, String(MANUAL_CLOSE_WARNING_SECONDS)],
    );
    const warningDeadline = updated.rows[0]!.warning_deadline.toISOString();

    const revision = await bumpRevision(
      client,
      input.auctionId,
      "close_warning",
      {
        presentationId: input.presentationId,
        warningDeadline,
      },
    );
    await writeAuditEntry(client, {
      action: "begin_close",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: { presentationId: input.presentationId },
    });

    const result = { warningDeadline };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "begin_close",
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

/** Cancels a running Manual Close warning without changing the leader or price. */
export async function cancelManualClose(
  pool: Pool,
  input: QuickCloseInput,
): Promise<LiveCommandOutcome<{ presentationId: string }>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const auction = await lockLiveAuction(client, input.auctionId);
    if (!auction || auction.organizerId !== input.actorUserId) {
      await client.query("rollback");
      return { status: "unauthorized" };
    }
    const stored = await findStoredCommand<{ presentationId: string }>(
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
    if (auction.status !== "live") {
      await client.query("rollback");
      return closeReject("auction_not_live", auction.revision);
    }
    if (input.expectedRevision !== auction.revision) {
      await client.query("rollback");
      return closeReject("stale_revision", auction.revision);
    }

    const presentation = await loadPresentation(
      client,
      input.auctionId,
      input.presentationId,
    );
    if (!presentation) {
      await client.query("rollback");
      return closeReject("presentation_missing", auction.revision);
    }
    if (presentation.state !== "closing") {
      await client.query("rollback");
      return closeReject("not_closing", auction.revision);
    }

    await client.query(
      `update "player_presentation"
          set "state" = 'open', "warning_deadline" = null, "updated_at" = now()
        where "id" = $1`,
      [input.presentationId],
    );
    const revision = await bumpRevision(
      client,
      input.auctionId,
      "close_warning_cancelled",
      { presentationId: input.presentationId },
    );
    await writeAuditEntry(client, {
      action: "cancel_close",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: { presentationId: input.presentationId },
    });

    const result = { presentationId: input.presentationId };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "cancel_close",
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

export interface FinalizeInput {
  actorUserId: string;
  auctionId: string;
  commandId: string;
  presentationId: string;
}

async function existingOutcome(
  client: PoolClient,
  auctionId: string,
  presentation: PresentationRow,
): Promise<null | PresentationOutcome> {
  if (presentation.state === "sold") {
    const sale = await client.query<{
      amount: number;
      id: string;
      team_id: string;
    }>(
      `select "id", "amount", "team_id" from "sale"
        where "auction_id" = $1 and "presentation_id" = $2
          and "reversed_at" is null`,
      [auctionId, presentation.id],
    );
    const row = sale.rows[0];
    return row
      ? {
          amount: row.amount,
          kind: "sold",
          saleId: row.id,
          teamId: row.team_id,
        }
      : { kind: "unsold" };
  }
  if (presentation.state === "unsold") return { kind: "unsold" };
  return null;
}

/**
 * Closes an expired Player Presentation exactly once. The committed leader
 * becomes a Sale; a Presentation with no valid Bid becomes Unsold and enters
 * the Unsold Pool. A duplicate finalizer or a repeated command ID returns the
 * one committed outcome and creates no second Sale, revision, or Sale row.
 */
export async function finalizePresentation(
  pool: Pool,
  input: FinalizeInput,
): Promise<LiveCommandOutcome<PresentationOutcome>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const auction = await lockLiveAuction(client, input.auctionId);
    if (!auction) {
      await client.query("rollback");
      return { status: "unauthorized" };
    }
    const participant = await client.query(
      `select 1 from "auction" a
        where a."id" = $1
          and (a."organizer_id" = $2
               or exists (select 1 from "team" t
                           where t."auction_id" = a."id"
                             and t."representative_user_id" = $2))`,
      [input.auctionId, input.actorUserId],
    );
    if (!participant.rowCount) {
      await client.query("rollback");
      return { status: "unauthorized" };
    }

    const stored = await findStoredCommand<PresentationOutcome>(
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

    const presentation = await loadPresentation(
      client,
      input.auctionId,
      input.presentationId,
    );
    if (!presentation) {
      await client.query("rollback");
      return closeReject("presentation_missing", auction.revision);
    }

    const already = await existingOutcome(
      client,
      input.auctionId,
      presentation,
    );
    if (already) {
      await storeCommand(client, {
        actorUserId: input.actorUserId,
        auctionId: input.auctionId,
        commandId: input.commandId,
        kind: "finalize",
        result: already,
      });
      await client.query("commit");
      return {
        result: already,
        revision: auction.revision,
        status: "replayed",
      };
    }

    if (presentation.state !== "closing") {
      await client.query("rollback");
      return closeReject("not_closing", auction.revision);
    }
    const time = await client.query<{ now: Date }>(`select now() as now`);
    if (
      presentation.warning_deadline &&
      time.rows[0]!.now < presentation.warning_deadline
    ) {
      await client.query("rollback");
      return closeReject("too_early", auction.revision);
    }
    if (auction.status !== "live" && auction.status !== "paused") {
      await client.query("rollback");
      return closeReject("auction_not_live", auction.revision);
    }

    const leader = await client.query<{ amount: number; team_id: string }>(
      `select "amount", "team_id" from "bid_attempt"
        where "presentation_id" = $1 and "status" = 'accepted'
        order by "amount" desc limit 1`,
      [presentation.id],
    );
    const winning = leader.rows[0];

    let result: PresentationOutcome;
    let kind: string;
    if (winning) {
      const sale = await client.query<{ id: string }>(
        `insert into "sale"
            ("auction_id", "presentation_id", "player_entry_id", "team_id",
             "amount", "source")
         values ($1, $2, $3, $4, $5, 'bid')
         returning "id"`,
        [
          input.auctionId,
          presentation.id,
          presentation.player_entry_id,
          winning.team_id,
          winning.amount,
        ],
      );
      await client.query(
        `update "player_presentation"
            set "state" = 'sold', "closed_at" = now(), "warning_deadline" = null,
                "updated_at" = now()
          where "id" = $1`,
        [presentation.id],
      );
      result = {
        amount: winning.amount,
        kind: "sold",
        saleId: sale.rows[0]!.id,
        teamId: winning.team_id,
      };
      kind = "player_sold";
    } else {
      await client.query(
        `insert into "unsold_membership"
            ("player_entry_id", "auction_id", "tier_id", "presentation_id")
         values ($1, $2, $3, $4)
         on conflict ("player_entry_id") do nothing`,
        [
          presentation.player_entry_id,
          input.auctionId,
          presentation.tier_id,
          presentation.id,
        ],
      );
      await client.query(
        `update "player_presentation"
            set "state" = 'unsold', "closed_at" = now(), "warning_deadline" = null,
                "updated_at" = now()
          where "id" = $1`,
        [presentation.id],
      );
      result = { kind: "unsold" };
      kind = "player_unsold";
    }

    const revision = await bumpRevision(client, input.auctionId, kind, {
      presentationId: presentation.id,
      ...(winning ? { amount: winning.amount, teamId: winning.team_id } : {}),
    });
    await writeAuditEntry(client, {
      action: winning ? "sale" : "unsold",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: {
        playerEntryId: presentation.player_entry_id,
        presentationId: presentation.id,
        ...(winning ? { amount: winning.amount, teamId: winning.team_id } : {}),
      },
    });

    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "finalize",
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

function closeReject<T>(
  reason: CloseRejectionReason,
  revision: number,
): LiveCommandOutcome<T> {
  return {
    message: CLOSE_REJECTION_MESSAGES[reason],
    reason,
    revision,
    status: "rejected",
  };
}
