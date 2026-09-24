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
      presentation_id: null | string;
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
    // and its reversal remain the authoritative record. Direct Sales have no
    // Presentation, so there is nothing to return.
    if (sale.presentation_id !== null) {
      await client.query(
        `update "player_presentation"
            set "state" = 'returned', "return_reason" = $2,
                "closed_at" = coalesce("closed_at", now()), "updated_at" = now()
          where "id" = $1`,
        [sale.presentation_id, reason],
      );
    }

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

export interface DirectSaleInput {
  actorUserId: string;
  auctionId: string;
  commandId: string;
  expectedRevision: number;
  /** Positive integer Credits to deduct from the Team Budget. */
  amount: number;
  playerEntryId: string;
  reason: string;
  teamId: string;
}

export interface DirectSaleResult {
  amount: number;
  playerEntryId: string;
  saleId: string;
  teamId: string;
}

/**
 * Assigns a pre-registered Player to a named Team at a custom Credit amount
 * while the Auction is Paused, bypassing the bidding process. All Budget,
 * Roster, Tier, and Legal Completion constraints still apply. The resulting
 * Sale is reversible through the normal Sale Reversal flow.
 */
export async function directSale(
  pool: Pool,
  input: DirectSaleInput,
): Promise<LiveCommandOutcome<DirectSaleResult>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const opened = await prelude<DirectSaleResult>(client, input);
    if ("failure" in opened) {
      await client.query("rollback");
      return opened.failure;
    }
    const { auction } = opened;

    // Validate amount before any DB reads.
    if (!Number.isInteger(input.amount) || input.amount < 1) {
      await client.query("rollback");
      return reject("invalid_amount", auction.revision);
    }

    // Verify the Player Entry belongs to this Auction, is not a
    // Player Representative, and has no open/closing Presentation.
    const playerResult = await client.query<{
      id: string;
      is_representative: boolean;
      tier_id: null | string;
    }>(
      `select pe."id", pe."is_representative", pe."tier_id"
         from "player_entry" pe
        where pe."id" = $1 and pe."auction_id" = $2`,
      [input.playerEntryId, input.auctionId],
    );
    const player = playerResult.rows[0];
    if (!player) {
      await client.query("rollback");
      return reject("player_not_found", auction.revision);
    }
    if (player.is_representative) {
      await client.query("rollback");
      return reject("player_is_representative", auction.revision);
    }

    // No active (unreversed) Sale.
    const activeSale = await client.query(
      `select 1 from "sale"
        where "player_entry_id" = $1 and "reversed_at" is null`,
      [input.playerEntryId],
    );
    if (activeSale.rowCount && activeSale.rowCount > 0) {
      await client.query("rollback");
      return reject("player_already_sold", auction.revision);
    }

    // No open or closing Presentation.
    const activePresentation = await client.query(
      `select 1 from "player_presentation"
         where "player_entry_id" = $1 and "state" in ('open', 'closing')`,
      [input.playerEntryId],
    );
    if (activePresentation.rowCount && activePresentation.rowCount > 0) {
      await client.query("rollback");
      return reject("player_currently_offered", auction.revision);
    }

    // Verify the Team belongs to this Auction and load the budget / roster state.
    const teamResult = await client.query<{
      id: string;
      budget: number;
      roster_count: number;
      spent_credits: number;
    }>(
      `select t."id",
              ars."budget",
              coalesce((
                select count(*)::int
                  from "sale" s
                  join "player_entry" pe2 on pe2."id" = s."player_entry_id"
                 where s."team_id" = t."id"
                   and s."reversed_at" is null
                   and s."auction_id" = $1
              ), 0) as roster_count,
              coalesce((
                select sum(s."amount")::int
                  from "sale" s
                 where s."team_id" = t."id"
                   and s."reversed_at" is null
                   and s."auction_id" = $1
              ), 0) as spent_credits
         from "team" t
         join "auction_rule_set" ars on ars."auction_id" = t."auction_id"
        where t."id" = $2 and t."auction_id" = $1`,
      [input.auctionId, input.teamId],
    );
    const team = teamResult.rows[0];
    if (!team) {
      await client.query("rollback");
      return { status: "unauthorized" };
    }

    const remainingBudget = team.budget - team.spent_credits;
    if (remainingBudget < input.amount) {
      await client.query("rollback");
      return reject("insufficient_budget", auction.revision);
    }

    // Roster max check.
    const rosterMaxResult = await client.query<{ roster_max: number }>(
      `select "roster_max" from "auction_rule_set" where "auction_id" = $1`,
      [input.auctionId],
    );
    const rosterMax = rosterMaxResult.rows[0]?.roster_max ?? Infinity;

    // Also count pre-assigned representatives.
    const totalRosterResult = await client.query<{ count: number }>(
      `select count(*)::int as count from "player_entry"
        where "team_id" = $1 and "auction_id" = $2 and "is_representative" = true`,
      [input.teamId, input.auctionId],
    );
    const totalRoster =
      team.roster_count + (totalRosterResult.rows[0]?.count ?? 0);

    if (totalRoster >= rosterMax) {
      await client.query("rollback");
      return reject("roster_max_reached", auction.revision);
    }

    // Tiered: check per-tier max.
    if (auction.rulesMode === "tiered" && player.tier_id) {
      const tierResult = await client.query<{
        max_per_team: number;
        tier_count: number;
      }>(
        `select t."max_per_team",
                coalesce((
                  select count(*)::int
                    from "sale" s
                    join "player_entry" pe3 on pe3."id" = s."player_entry_id"
                   where s."team_id" = $1
                     and s."auction_id" = $2
                     and s."reversed_at" is null
                     and pe3."tier_id" = $3
                ), 0) as tier_count
           from "tier" t
          where t."id" = $3 and t."auction_id" = $2`,
        [input.teamId, input.auctionId, player.tier_id],
      );
      const tier = tierResult.rows[0];
      if (tier && tier.tier_count >= tier.max_per_team) {
        await client.query("rollback");
        return reject("tier_max_reached", auction.revision);
      }
    }

    // Insert the Direct Sale. presentation_id is intentionally omitted:
    // the column is nullable (see migration 20260922130002) because a Direct
    // Sale bypasses the normal bidding flow and has no player_presentation row.
    const inserted = await client.query<{ id: string }>(
      `insert into "sale"
          ("auction_id", "player_entry_id", "team_id", "amount", "source")
       values ($1, $2, $3, $4, 'direct')
       returning "id"`,
      [input.auctionId, input.playerEntryId, input.teamId, input.amount],
    );
    const saleId = inserted.rows[0]!.id;

    // Legal Completion check after the Sale row exists (same pattern as reverseSale).
    if (
      !(await auctionKeepsLegalCompletion(client, {
        auctionId: input.auctionId,
        rulesMode: auction.rulesMode,
      }))
    ) {
      await client.query("rollback");
      return reject("no_legal_completion", auction.revision);
    }

    // Clear any unresolved unsold membership so the Player no longer appears
    // in the Unsold Pool.
    await client.query(
      `update "unsold_membership"
          set "resolved_at" = now(), "resolution" = 'assigned', "sale_id" = $2
        where "player_entry_id" = $1 and "resolved_at" is null`,
      [input.playerEntryId, saleId],
    );

    const revision = await bumpRevision(
      client,
      input.auctionId,
      "direct_sale",
      {
        amount: input.amount,
        playerEntryId: input.playerEntryId,
        reason: input.reason.trim(),
        saleId,
        teamId: input.teamId,
      },
    );
    await writeAuditEntry(client, {
      action: "direct_sale",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: {
        amount: input.amount,
        playerEntryId: input.playerEntryId,
        saleId,
        teamId: input.teamId,
      },
      reason: input.reason.trim(),
    });

    const result: DirectSaleResult = {
      amount: input.amount,
      playerEntryId: input.playerEntryId,
      saleId,
      teamId: input.teamId,
    };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "direct_sale",
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
