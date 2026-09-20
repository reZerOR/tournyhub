import type { Pool, PoolClient } from "pg";

import {
  CORRECTION_REJECTION_MESSAGES,
  CORRECTION_REASON_MAX,
  type CorrectionRejectionReason,
} from "@/domain/live";
import { auctionKeepsLegalCompletion } from "@/server/auction-command/legal-completion-check";
import {
  bumpRevision,
  findStoredCommand,
  type LiveCommandOutcome,
  type LockedLiveAuction,
  lockLiveAuction,
  rejection,
  storeCommand,
  writeAuditEntry,
} from "@/server/auction-command/live-command";

export interface CorrectionInput {
  actorUserId: string;
  auctionId: string;
  commandId: string;
  expectedRevision: number;
  reason: string;
}

function reject<T>(
  reason: CorrectionRejectionReason,
  revision: number,
): LiveCommandOutcome<T> {
  return rejection(CORRECTION_REJECTION_MESSAGES[reason], reason, revision);
}

interface CorrectionPrelude {
  auction: LockedLiveAuction;
}

type PreludeOutcome<T> =
  { failure: LiveCommandOutcome<T> } | ({ ok: true } & CorrectionPrelude);

/**
 * The shared opening of every correction: the Organizer, a Paused Auction, the
 * expected revision, a usable reason, and the idempotency ledger. A correction
 * is only ever allowed while Paused, so it cannot race live bidding.
 */
async function prelude<T>(
  client: PoolClient,
  input: CorrectionInput,
): Promise<PreludeOutcome<T>> {
  const auction = await lockLiveAuction(client, input.auctionId);
  if (!auction || auction.organizerId !== input.actorUserId) {
    return { failure: { status: "unauthorized" } };
  }

  const stored = await findStoredCommand<T>(
    client,
    input.auctionId,
    input.commandId,
  );
  if (stored) {
    return {
      failure:
        stored.actorUserId === input.actorUserId
          ? {
              result: stored.result,
              revision: auction.revision,
              status: "replayed",
            }
          : { status: "unauthorized" },
    };
  }

  if (auction.status !== "paused") {
    return { failure: reject("auction_not_paused", auction.revision) };
  }
  if (input.expectedRevision !== auction.revision) {
    return { failure: reject("stale_revision", auction.revision) };
  }

  const reason = input.reason.trim();
  if (reason.length === 0 || reason.length > CORRECTION_REASON_MAX) {
    return { failure: reject("reason_required", auction.revision) };
  }

  return { auction, ok: true };
}

export interface CancelBidResult {
  cancelledAmount: number;
  cancelledTeamId: string;
  presentationId: string;
  restoredAmount: null | number;
  restoredTeamId: null | string;
}

/**
 * Cancels the current highest Bid while Paused. The accepted Bid keeps its
 * amount, Team, and server time and only gains a cancellation status and
 * reason, so every prior attempt stays inspectable. The preceding valid Bid
 * becomes the leader again, or the Player returns to its Starting Price.
 */
export async function cancelHighestBid(
  pool: Pool,
  input: CorrectionInput & { presentationId: string },
): Promise<LiveCommandOutcome<CancelBidResult>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const opened = await prelude<CancelBidResult>(client, input);
    if ("failure" in opened) {
      await client.query("rollback");
      return opened.failure;
    }
    const { auction } = opened;

    const presentation = await client.query<{ state: string }>(
      `select "state" from "player_presentation"
        where "id" = $1 and "auction_id" = $2`,
      [input.presentationId, input.auctionId],
    );
    const current = presentation.rows[0];
    if (!current || (current.state !== "open" && current.state !== "closing")) {
      await client.query("rollback");
      return reject("presentation_missing", auction.revision);
    }

    const highest = await client.query<{
      amount: number;
      id: string;
      team_id: string;
    }>(
      `select "id", "amount", "team_id" from "bid_attempt"
        where "presentation_id" = $1 and "status" = 'accepted'
        order by "amount" desc, "server_time" asc
        limit 1`,
      [input.presentationId],
    );
    const cancelled = highest.rows[0];
    if (!cancelled) {
      await client.query("rollback");
      return reject("no_bid", auction.revision);
    }

    const updated = await client.query(
      `update "bid_attempt"
          set "status" = 'cancelled',
              "reason" = $3,
              "cancelled_at" = now(),
              "cancelled_by_user_id" = $4
        where "id" = $1 and "status" = 'accepted' and "presentation_id" = $2`,
      [
        cancelled.id,
        input.presentationId,
        input.reason.trim(),
        input.actorUserId,
      ],
    );
    if (updated.rowCount !== 1) {
      // Another committed correction already cancelled this Bid.
      await client.query("rollback");
      return reject("no_bid", auction.revision);
    }

    if (
      !(await auctionKeepsLegalCompletion(client, {
        auctionId: input.auctionId,
        rulesMode: auction.rulesMode,
      }))
    ) {
      await client.query("rollback");
      return reject("no_legal_completion", auction.revision);
    }

    const restored = await client.query<{ amount: number; team_id: string }>(
      `select "amount", "team_id" from "bid_attempt"
        where "presentation_id" = $1 and "status" = 'accepted'
        order by "amount" desc, "server_time" asc
        limit 1`,
      [input.presentationId],
    );
    const previous = restored.rows[0] ?? null;

    const revision = await bumpRevision(
      client,
      input.auctionId,
      "bid_cancelled",
      {
        announcement: `The Organizer cancelled the highest Bid of ${cancelled.amount}.`,
        cancelledAmount: cancelled.amount,
        cancelledTeamId: cancelled.team_id,
        presentationId: input.presentationId,
        reason: input.reason.trim(),
        restoredAmount: previous?.amount ?? null,
        restoredTeamId: previous?.team_id ?? null,
      },
    );
    await writeAuditEntry(client, {
      action: "cancel_bid",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: {
        before: {
          amount: cancelled.amount,
          leadingTeamId: cancelled.team_id,
        },
        presentationId: input.presentationId,
        restored: previous
          ? { amount: previous.amount, leadingTeamId: previous.team_id }
          : { amount: null, leadingTeamId: null },
      },
      reason: input.reason.trim(),
    });

    const result: CancelBidResult = {
      cancelledAmount: cancelled.amount,
      cancelledTeamId: cancelled.team_id,
      presentationId: input.presentationId,
      restoredAmount: previous?.amount ?? null,
      restoredTeamId: previous?.team_id ?? null,
    };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "cancel_bid",
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

export interface ReverseSaleResult {
  amount: number;
  playerEntryId: string;
  saleId: string;
  teamId: string;
}

/**
 * Reverses a completed Sale while Paused and before Auction completion. The
 * original Sale stays in place and gains a compensating `sale_reversal`
 * record; the Team is refunded, its Roster entry disappears, and the Player
 * returns to the Unsold Pool.
 */
export async function reverseSale(
  pool: Pool,
  input: CorrectionInput & { saleId: string },
): Promise<LiveCommandOutcome<ReverseSaleResult>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const opened = await prelude<ReverseSaleResult>(client, input);
    if ("failure" in opened) {
      await client.query("rollback");
      return opened.failure;
    }
    const { auction } = opened;

    const saleResult = await client.query<{
      amount: number;
      player_entry_id: string;
      presentation_id: string;
      reversed_at: Date | null;
      team_id: string;
      tier_id: null | string;
    }>(
      `select s."amount", s."player_entry_id", s."presentation_id",
              s."reversed_at", s."team_id", pe."tier_id"
         from "sale" s
         join "player_entry" pe on pe."id" = s."player_entry_id"
        where s."id" = $1 and s."auction_id" = $2`,
      [input.saleId, input.auctionId],
    );
    const sale = saleResult.rows[0];
    if (!sale) {
      await client.query("rollback");
      return reject("sale_missing", auction.revision);
    }
    if (sale.reversed_at !== null) {
      await client.query("rollback");
      return reject("already_reversed", auction.revision);
    }

    const reason = input.reason.trim();
    await client.query(
      `update "sale"
          set "reversed_at" = now(), "reversed_reason" = $2,
              "reversed_by_user_id" = $3
        where "id" = $1 and "reversed_at" is null`,
      [input.saleId, reason, input.actorUserId],
    );
    await client.query(
      `insert into "sale_reversal"
          ("auction_id", "sale_id", "player_entry_id", "team_id", "amount",
           "reason", "actor_user_id")
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.auctionId,
        input.saleId,
        sale.player_entry_id,
        sale.team_id,
        sale.amount,
        reason,
        input.actorUserId,
      ],
    );

    // The Presentation no longer ends in an active Sale, so it returns to the
    // queue instead of blocking the Player from being offered again. The Sale
    // and its reversal remain the authoritative record.
    await client.query(
      `update "player_presentation"
          set "state" = 'returned', "return_reason" = $2,
              "closed_at" = coalesce("closed_at", now()), "updated_at" = now()
        where "id" = $1`,
      [sale.presentation_id, reason],
    );

    await client.query(
      `insert into "unsold_membership"
          ("player_entry_id", "auction_id", "tier_id", "presentation_id")
       values ($1, $2, $3, $4)
       on conflict ("player_entry_id") do update
         set "auction_id" = excluded."auction_id",
             "tier_id" = excluded."tier_id",
             "presentation_id" = excluded."presentation_id",
             "resolved_at" = null,
             "resolution" = null,
             "sale_id" = null`,
      [
        sale.player_entry_id,
        input.auctionId,
        sale.tier_id,
        sale.presentation_id,
      ],
    );

    if (
      !(await auctionKeepsLegalCompletion(client, {
        auctionId: input.auctionId,
        rulesMode: auction.rulesMode,
      }))
    ) {
      await client.query("rollback");
      return reject("no_legal_completion", auction.revision);
    }

    const revision = await bumpRevision(
      client,
      input.auctionId,
      "sale_reversed",
      {
        announcement: `The Organizer reversed a Sale of ${sale.amount}.`,
        amount: sale.amount,
        playerEntryId: sale.player_entry_id,
        reason,
        saleId: input.saleId,
        teamId: sale.team_id,
      },
    );
    await writeAuditEntry(client, {
      action: "reverse_sale",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: {
        after: { teamId: null },
        before: { amount: sale.amount, teamId: sale.team_id },
        playerEntryId: sale.player_entry_id,
        saleId: input.saleId,
      },
      reason,
    });

    const result: ReverseSaleResult = {
      amount: sale.amount,
      playerEntryId: sale.player_entry_id,
      saleId: input.saleId,
      teamId: sale.team_id,
    };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "reverse_sale",
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
