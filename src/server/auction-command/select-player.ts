import type { Pool, PoolClient } from "pg";

import type { RulesMode } from "@/domain/auction";
import {
  SELECTION_REJECTION_MESSAGES,
  type SelectionRejectionReason,
} from "@/domain/live";
import { resolveOfferedStartingPrice } from "@/domain/rules";
import {
  bumpRevision,
  findStoredCommand,
  type LiveCommandOutcome,
  lockLiveAuction,
  storeCommand,
  writeAuditEntry,
} from "@/server/auction-command/live-command";
import { secureFraction } from "@/server/auction-command/secure-random";
import { loadOpenUnsoldRound } from "@/server/auction-query/progress";
import type { Queryable } from "@/server/database/queryable";

export interface EligiblePlayer {
  displayName: string;
  id: string;
  startingPrice: number;
  tierId: null | string;
}

export interface SelectPlayerResult {
  closeDeadline: null | string;
  displayName: string;
  playerEntryId: string;
  presentationId: string;
  selectionMethod: "manual" | "random";
  startingPrice: number;
  tierId: null | string;
}

export interface SelectPlayerInput {
  actorUserId: string;
  auctionId: string;
  commandId: string;
  expectedRevision: number;
  /** Required for manual selection; ignored for Random Selection. */
  playerEntryId?: null | string;
  /** Injectable randomness for deterministic tests. Returns [0, 1). */
  random?: () => number;
  selectionMethod: "manual" | "random";
}

/**
 * The Players eligible to be offered. Normally they are the unoffered or
 * returned biddable Players in the Active Tier, or every such Player under
 * Simple Rules. While an Unsold Round is open, they are instead the unresolved
 * Unsold Pool Players that the round has not completed yet.
 *
 * A Player offered again keeps the Starting Price frozen when it was first
 * offered, so reoffering cannot change the price.
 */
export async function loadEligiblePlayers(
  client: Queryable,
  auctionId: string,
  rulesMode: RulesMode,
  activeTierId: null | string,
  defaultStartingPrice: number,
  unsoldRoundId: null | string = null,
): Promise<EligiblePlayer[]> {
  const restrictTier = rulesMode === "tiered" && unsoldRoundId === null;
  const result = await client.query<{
    display_name: string;
    frozen_starting_price: null | number;
    id: string;
    starting_price_override: null | number;
    tier_id: null | string;
    tier_starting_price: null | number;
  }>(
    `select pe."id", pe."display_name", pe."starting_price_override",
            pe."tier_id", t."starting_price" as tier_starting_price,
            first_presentation."starting_price" as frozen_starting_price
       from "player_entry" pe
       left join "tier" t on t."id" = pe."tier_id"
       left join lateral (
         select pp."starting_price" from "player_presentation" pp
          where pp."player_entry_id" = pe."id"
          order by pp."opened_at" asc, pp."created_at" asc
          limit 1
       ) first_presentation on true
      where pe."auction_id" = $1
        and not pe."is_representative"
        and not exists (
          select 1 from "player_presentation" pp
           where pp."player_entry_id" = pe."id"
             and pp."state" in ('open', 'closing'))
        and not exists (
          select 1 from "sale" s
           where s."player_entry_id" = pe."id" and s."reversed_at" is null)
        and (
          (
            $4::uuid is null
            and ($2 = false or pe."tier_id" = $3)
            and not exists (
              select 1 from "player_presentation" tp
               where tp."player_entry_id" = pe."id"
                 and tp."state" in ('sold', 'unsold'))
          )
          or (
            $4::uuid is not null
            and exists (
              select 1 from "unsold_membership" um
               where um."player_entry_id" = pe."id"
                 and um."resolved_at" is null)
            and not exists (
              select 1 from "player_presentation" rp
               where rp."player_entry_id" = pe."id"
                 and rp."unsold_round_id" = $4
                 and rp."state" in ('sold', 'unsold'))
          )
        )
      order by pe."created_at" asc, pe."id" asc`,
    [auctionId, restrictTier, activeTierId, unsoldRoundId],
  );

  return result.rows.map((row) => ({
    displayName: row.display_name,
    id: row.id,
    startingPrice:
      row.frozen_starting_price ??
      resolveOfferedStartingPrice({
        defaultStartingPrice,
        startingPriceOverride: row.starting_price_override,
        tierStartingPrice:
          rulesMode === "tiered" ? row.tier_starting_price : null,
      }),
    tierId: row.tier_id,
  }));
}

async function loadCloseSettings(
  client: PoolClient,
  auctionId: string,
): Promise<{ defaultStartingPrice: number; timedCloseSeconds: number }> {
  const result = await client.query<{
    default_starting_price: null | number;
    timed_close_seconds: number;
  }>(
    `select "default_starting_price", "timed_close_seconds"
       from "auction_rule_set" where "auction_id" = $1`,
    [auctionId],
  );
  return {
    defaultStartingPrice: result.rows[0]?.default_starting_price ?? 0,
    timedCloseSeconds: result.rows[0]?.timed_close_seconds ?? 30,
  };
}

function rejected(
  reason: SelectionRejectionReason,
  revision: number,
): LiveCommandOutcome<SelectPlayerResult> {
  return {
    message: SELECTION_REJECTION_MESSAGES[reason],
    reason,
    revision,
    status: "rejected",
  };
}

/**
 * Offers one Player. Manual selection names the Player; Random Selection
 * chooses uniformly among the same eligible set and records the method and
 * result for audit. Only the Organizer may select. A Timed Close Auction
 * stores the database deadline for the new Presentation in the same
 * transaction. A committed selection advances the revision exactly once and
 * appears to every participant only after commit.
 */
export async function selectPlayer(
  pool: Pool,
  input: SelectPlayerInput,
): Promise<LiveCommandOutcome<SelectPlayerResult>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const auction = await lockLiveAuction(client, input.auctionId);
    if (!auction) {
      await client.query("rollback");
      return { status: "unauthorized" };
    }
    if (auction.organizerId !== input.actorUserId) {
      await client.query("rollback");
      return { status: "unauthorized" };
    }

    const stored = await findStoredCommand<SelectPlayerResult>(
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
      return rejected("auction_not_live", auction.revision);
    }
    if (input.expectedRevision !== auction.revision) {
      await client.query("rollback");
      return rejected("stale_revision", auction.revision);
    }

    const active = await client.query(
      `select 1 from "player_presentation"
        where "auction_id" = $1 and "state" in ('open', 'closing')`,
      [input.auctionId],
    );
    if (active.rowCount && active.rowCount > 0) {
      await client.query("rollback");
      return rejected("presentation_active", auction.revision);
    }

    const round = await loadOpenUnsoldRound(client, input.auctionId);
    const settings = await loadCloseSettings(client, input.auctionId);
    const eligible = await loadEligiblePlayers(
      client,
      input.auctionId,
      auction.rulesMode,
      auction.activeTierId,
      settings.defaultStartingPrice,
      round?.id ?? null,
    );
    if (eligible.length === 0) {
      await client.query("rollback");
      return rejected("no_eligible_players", auction.revision);
    }

    let chosen: EligiblePlayer | undefined;
    if (input.selectionMethod === "random") {
      const fraction = (input.random ?? secureFraction)();
      const index = Math.min(
        eligible.length - 1,
        Math.max(0, Math.floor(fraction * eligible.length)),
      );
      chosen = eligible[index];
    } else {
      chosen = eligible.find((player) => player.id === input.playerEntryId);
    }
    if (!chosen) {
      await client.query("rollback");
      return rejected("not_eligible", auction.revision);
    }

    const inserted = await client.query<{
      close_deadline: Date | null;
      id: string;
    }>(
      `insert into "player_presentation"
          ("auction_id", "player_entry_id", "tier_id", "starting_price",
           "selection_method", "state", "close_mode", "close_deadline",
           "unsold_round_id")
       values ($1, $2, $3, $4, $5, 'open', $6,
               case when $6 = 'timed'
                    then now() + ($7 || ' seconds')::interval
                    else null end,
               $8)
       returning "id", "close_deadline"`,
      [
        input.auctionId,
        chosen.id,
        chosen.tierId,
        chosen.startingPrice,
        input.selectionMethod,
        auction.closeMode,
        String(settings.timedCloseSeconds),
        round?.id ?? null,
      ],
    );
    const closeDeadline =
      inserted.rows[0]!.close_deadline?.toISOString() ?? null;

    const revision = await bumpRevision(
      client,
      input.auctionId,
      "player_presented",
      {
        closeDeadline,
        playerEntryId: chosen.id,
        presentationId: inserted.rows[0]!.id,
        selectionMethod: input.selectionMethod,
        startingPrice: chosen.startingPrice,
        tierId: chosen.tierId,
        unsoldRoundId: round?.id ?? null,
      },
    );
    await writeAuditEntry(client, {
      action:
        input.selectionMethod === "random"
          ? "random_selection"
          : "select_player",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: {
        eligibleCount: eligible.length,
        playerEntryId: chosen.id,
        selectionMethod: input.selectionMethod,
      },
    });

    const result: SelectPlayerResult = {
      closeDeadline,
      displayName: chosen.displayName,
      playerEntryId: chosen.id,
      presentationId: inserted.rows[0]!.id,
      selectionMethod: input.selectionMethod,
      startingPrice: chosen.startingPrice,
      tierId: chosen.tierId,
    };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "select_player",
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

export interface ReturnPlayerInput {
  actorUserId: string;
  auctionId: string;
  commandId: string;
  expectedRevision: number;
  presentationId: string;
  reason: string;
}

export interface ReturnPlayerResult {
  playerEntryId: string;
  presentationId: string;
}

/**
 * Returns the unbid Active Player to the queue with a recorded reason. A Bid
 * already committed for the Player blocks this: the later Bid-cancellation
 * correction flow is required, and Bid history is never deleted.
 */
export async function returnActivePlayer(
  pool: Pool,
  input: ReturnPlayerInput,
): Promise<LiveCommandOutcome<ReturnPlayerResult>> {
  const reason = input.reason.trim();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const auction = await lockLiveAuction(client, input.auctionId);
    if (!auction || auction.organizerId !== input.actorUserId) {
      await client.query("rollback");
      return { status: "unauthorized" };
    }

    const stored = await findStoredCommand<ReturnPlayerResult>(
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
      return rejected("auction_not_live", auction.revision);
    }
    if (input.expectedRevision !== auction.revision) {
      await client.query("rollback");
      return rejected("stale_revision", auction.revision);
    }

    const presentation = await client.query<{
      player_entry_id: string;
      state: string;
    }>(
      `select "player_entry_id", "state" from "player_presentation"
        where "id" = $1 and "auction_id" = $2`,
      [input.presentationId, input.auctionId],
    );
    const row = presentation.rows[0];
    if (!row || (row.state !== "open" && row.state !== "closing")) {
      await client.query("rollback");
      return rejected("presentation_missing", auction.revision);
    }

    const bid = await client.query(
      `select 1 from "bid_attempt"
        where "presentation_id" = $1 and "status" = 'accepted'`,
      [input.presentationId],
    );
    if (bid.rowCount && bid.rowCount > 0) {
      await client.query("rollback");
      return rejected("bid_exists", auction.revision);
    }
    if (reason.length === 0 || reason.length > 200) {
      await client.query("rollback");
      return rejected("reason_required", auction.revision);
    }

    await client.query(
      `update "player_presentation"
          set "state" = 'returned', "return_reason" = $3, "closed_at" = now(),
              "warning_deadline" = null, "close_deadline" = null,
              "updated_at" = now()
        where "id" = $1 and "auction_id" = $2`,
      [input.presentationId, input.auctionId, reason],
    );

    const revision = await bumpRevision(
      client,
      input.auctionId,
      "player_returned",
      {
        playerEntryId: row.player_entry_id,
        presentationId: input.presentationId,
        reason,
      },
    );
    await writeAuditEntry(client, {
      action: "return_player",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: {
        playerEntryId: row.player_entry_id,
        presentationId: input.presentationId,
      },
      reason,
    });

    const result: ReturnPlayerResult = {
      playerEntryId: row.player_entry_id,
      presentationId: input.presentationId,
    };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "return_player",
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
