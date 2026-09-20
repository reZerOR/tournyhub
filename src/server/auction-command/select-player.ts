import { randomBytes } from "node:crypto";
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
import type { Queryable } from "@/server/database/queryable";

export interface EligiblePlayer {
  displayName: string;
  id: string;
  startingPrice: number;
  tierId: null | string;
}

export interface SelectPlayerResult {
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

/** 48 bits of entropy, plenty to choose uniformly among at most 2,000 Players. */
function secureFraction(): number {
  const bytes = randomBytes(6);
  let value = 0;
  for (const byte of bytes) {
    value = value * 256 + byte;
  }
  return value / 2 ** 48;
}

/**
 * The Players eligible to be offered: unoffered or returned biddable Players
 * in the Active Tier, or every such Player under Simple Rules. A Player already
 * Sold, Unsold, or currently offered is not eligible.
 */
export async function loadEligiblePlayers(
  client: Queryable,
  auctionId: string,
  rulesMode: RulesMode,
  activeTierId: null | string,
  defaultStartingPrice: number,
): Promise<EligiblePlayer[]> {
  const result = await client.query<{
    display_name: string;
    id: string;
    starting_price_override: null | number;
    tier_id: null | string;
    tier_starting_price: null | number;
  }>(
    `select pe."id", pe."display_name", pe."starting_price_override",
            pe."tier_id", t."starting_price" as tier_starting_price
       from "player_entry" pe
       left join "tier" t on t."id" = pe."tier_id"
      where pe."auction_id" = $1
        and not pe."is_representative"
        and ($2 = false or pe."tier_id" = $3)
        and not exists (
          select 1 from "player_presentation" pp
           where pp."player_entry_id" = pe."id"
             and pp."state" in ('open', 'closing', 'sold', 'unsold'))
        and not exists (
          select 1 from "sale" s
           where s."player_entry_id" = pe."id" and s."reversed_at" is null)
      order by pe."created_at" asc, pe."id" asc`,
    [auctionId, rulesMode === "tiered", activeTierId],
  );

  return result.rows.map((row) => ({
    displayName: row.display_name,
    id: row.id,
    startingPrice: resolveOfferedStartingPrice({
      defaultStartingPrice,
      startingPriceOverride: row.starting_price_override,
      tierStartingPrice:
        rulesMode === "tiered" ? row.tier_starting_price : null,
    }),
    tierId: row.tier_id,
  }));
}

async function defaultStartingPrice(
  client: PoolClient,
  auctionId: string,
): Promise<number> {
  const result = await client.query<{ default_starting_price: null | number }>(
    `select "default_starting_price" from "auction_rule_set" where "auction_id" = $1`,
    [auctionId],
  );
  return result.rows[0]?.default_starting_price ?? 0;
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
 * result for audit. Only the Organizer may select. A committed selection
 * advances the revision exactly once and appears to every participant only
 * after commit.
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

    const fallback = await defaultStartingPrice(client, input.auctionId);
    const eligible = await loadEligiblePlayers(
      client,
      input.auctionId,
      auction.rulesMode,
      auction.activeTierId,
      fallback,
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

    const inserted = await client.query<{ id: string }>(
      `insert into "player_presentation"
          ("auction_id", "player_entry_id", "tier_id", "starting_price",
           "selection_method", "state", "close_mode")
       values ($1, $2, $3, $4, $5, 'open', $6)
       returning "id"`,
      [
        input.auctionId,
        chosen.id,
        chosen.tierId,
        chosen.startingPrice,
        input.selectionMethod,
        auction.closeMode,
      ],
    );

    const revision = await bumpRevision(
      client,
      input.auctionId,
      "player_presented",
      {
        playerEntryId: chosen.id,
        presentationId: inserted.rows[0]!.id,
        selectionMethod: input.selectionMethod,
        startingPrice: chosen.startingPrice,
        tierId: chosen.tierId,
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
              "warning_deadline" = null, "updated_at" = now()
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
