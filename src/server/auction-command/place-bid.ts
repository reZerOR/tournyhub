import type { Pool, PoolClient } from "pg";

import {
  BID_REJECTION_MESSAGES,
  nextBidAmount,
  type BidRejectionReason,
} from "@/domain/live";
import { bidKeepsLegalCompletion } from "@/server/auction-command/legal-completion-check";
import {
  bumpRevision,
  findStoredCommand,
  type LiveCommandOutcome,
  lockLiveAuction,
  storeCommand,
  writeAuditEntry,
} from "@/server/auction-command/live-command";
import { isUniqueViolation } from "@/server/database/pg-error";

export interface PlaceBidInput {
  actorUserId: string;
  amount: number;
  auctionId: string;
  commandId: string;
  expectedRevision: number;
  presentationId: string;
  teamId: string;
}

export interface PlaceBidResult {
  amount: number;
  bidAttemptId: string;
  presentationId: string;
  teamId: string;
}

type StoredBidOutcome =
  | {
      amount: number;
      bidAttemptId: string;
      presentationId: string;
      status: "accepted";
      teamId: string;
    }
  | { reason: BidRejectionReason; status: "rejected" };

interface PresentationRow {
  close_deadline: Date | null;
  id: string;
  player_entry_id: string;
  starting_price: number;
  state: string;
  tier_id: null | string;
  warning_deadline: Date | null;
}

interface TeamStateRow {
  budget: null | number;
  roster_max: null | number;
  roster_min: null | number;
}

async function loadTeamRosterCount(
  client: PoolClient,
  auctionId: string,
  teamId: string,
): Promise<{
  rosterCount: number;
  spent: number;
  tierCounts: Map<string, number>;
}> {
  const spend = await client.query<{ count: number; spent: number }>(
    `select coalesce(sum("amount") filter (where "reversed_at" is null), 0)::int as spent,
            count(*) filter (where "reversed_at" is null)::int as count
       from "sale" where "auction_id" = $1 and "team_id" = $2`,
    [auctionId, teamId],
  );
  const reps = await client.query<{ count: number; tier_id: null | string }>(
    `select "tier_id", count(*)::int as count from "player_entry"
      where "auction_id" = $1 and "team_id" = $2 and "is_representative"
      group by "tier_id"`,
    [auctionId, teamId],
  );
  const salesByTier = await client.query<{
    count: number;
    tier_id: null | string;
  }>(
    `select pe."tier_id", count(*)::int as count
       from "sale" s join "player_entry" pe on pe."id" = s."player_entry_id"
      where s."auction_id" = $1 and s."team_id" = $2 and s."reversed_at" is null
      group by pe."tier_id"`,
    [auctionId, teamId],
  );

  const tierCounts = new Map<string, number>();
  let rosterCount = spend.rows[0]!.count;
  const add = (tierId: null | string, count: number) => {
    tierCounts.set(
      tierId ?? "unassigned",
      (tierCounts.get(tierId ?? "unassigned") ?? 0) + count,
    );
  };
  for (const row of reps.rows) {
    add(row.tier_id, row.count);
    rosterCount += row.count;
  }
  for (const row of salesByTier.rows) {
    add(row.tier_id, row.count);
  }

  return { rosterCount, spent: spend.rows[0]!.spent, tierCounts };
}

async function currentAcceptedBid(
  client: PoolClient,
  presentationId: string,
): Promise<null | { amount: number; attemptId: string; teamId: string }> {
  const result = await client.query<{
    amount: number;
    id: string;
    team_id: string;
  }>(
    `select "id", "amount", "team_id" from "bid_attempt"
      where "presentation_id" = $1 and "status" = 'accepted'
      order by "amount" desc limit 1`,
    [presentationId],
  );
  const row = result.rows[0];
  return row
    ? { amount: row.amount, attemptId: row.id, teamId: row.team_id }
    : null;
}

/**
 * Submits the exact next Bid for one Team. The actor and Team are derived from
 * the session; a Bid is validated under the Auction lock against lifecycle,
 * the current Presentation, database time, the exact price, the leader, the
 * Team's Budget and maximums, and Legal Completion. Accepted and rejected
 * attempts are preserved; a duplicate command ID replays its original result.
 */
export async function placeBid(
  pool: Pool,
  input: PlaceBidInput,
): Promise<LiveCommandOutcome<PlaceBidResult>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const auction = await lockLiveAuction(client, input.auctionId);
    if (!auction) {
      await client.query("rollback");
      return { status: "unauthorized" };
    }

    const representative = await client.query(
      `select 1 from "team"
        where "id" = $1 and "auction_id" = $2 and "representative_user_id" = $3`,
      [input.teamId, input.auctionId, input.actorUserId],
    );
    if (!representative.rowCount) {
      await client.query("rollback");
      return {
        message: BID_REJECTION_MESSAGES.not_representative,
        reason: "not_representative",
        revision: auction.revision,
        status: "rejected",
      };
    }

    const stored = await findStoredCommand<StoredBidOutcome>(
      client,
      input.auctionId,
      input.commandId,
    );
    if (stored) {
      await client.query("rollback");
      if (stored.actorUserId !== input.actorUserId) {
        return { status: "unauthorized" };
      }
      return replayStored(stored.result, auction.revision);
    }

    const presentation = await client.query<PresentationRow>(
      `select "id", "player_entry_id", "tier_id", "starting_price", "state",
              "warning_deadline", "close_deadline"
         from "player_presentation" where "id" = $1 and "auction_id" = $2`,
      [input.presentationId, input.auctionId],
    );
    const current = presentation.rows[0];
    const amount = input.amount;
    const record = async (reason: BidRejectionReason) =>
      recordRejection(client, {
        actorUserId: input.actorUserId,
        amount,
        auctionId: input.auctionId,
        commandId: input.commandId,
        presentationId: current?.id ?? null,
        reason,
        teamId: input.teamId,
      });

    if (auction.status === "paused") {
      const outcome = reject("auction_paused", auction.revision);
      await record("auction_paused");
      await storeCommand(client, {
        actorUserId: input.actorUserId,
        auctionId: input.auctionId,
        commandId: input.commandId,
        kind: "place_bid",
        result: {
          reason: "auction_paused",
          status: "rejected",
        } satisfies StoredBidOutcome,
      });
      await client.query("commit");
      return outcome;
    }
    if (auction.status !== "live") {
      await client.query("rollback");
      return reject("auction_not_live", auction.revision);
    }
    if (input.expectedRevision !== auction.revision) {
      const outcome = reject("stale_revision", auction.revision);
      await record("stale_revision");
      await storeCommand(client, {
        actorUserId: input.actorUserId,
        auctionId: input.auctionId,
        commandId: input.commandId,
        kind: "place_bid",
        result: {
          reason: "stale_revision",
          status: "rejected",
        } satisfies StoredBidOutcome,
      });
      await client.query("commit");
      return outcome;
    }
    if (!current || (current.state !== "open" && current.state !== "closing")) {
      await client.query("rollback");
      return reject("presentation_missing", auction.revision);
    }

    const time = await client.query<{ now: Date }>(`select now() as now`);
    const now = time.rows[0]!.now;
    if (current.warning_deadline && now >= current.warning_deadline) {
      const outcome = reject("deadline_passed", auction.revision);
      await record("deadline_passed");
      await storeCommand(client, {
        actorUserId: input.actorUserId,
        auctionId: input.auctionId,
        commandId: input.commandId,
        kind: "place_bid",
        result: {
          reason: "deadline_passed",
          status: "rejected",
        } satisfies StoredBidOutcome,
      });
      await client.query("commit");
      return outcome;
    }
    if (current.close_deadline && now >= current.close_deadline) {
      const outcome = reject("deadline_passed", auction.revision);
      await record("deadline_passed");
      await storeCommand(client, {
        actorUserId: input.actorUserId,
        auctionId: input.auctionId,
        commandId: input.commandId,
        kind: "place_bid",
        result: {
          reason: "deadline_passed",
          status: "rejected",
        } satisfies StoredBidOutcome,
      });
      await client.query("commit");
      return outcome;
    }

    const rulesResult = await client.query<
      TeamStateRow & { bid_increment: null | number }
    >(
      `select "budget", "bid_increment", "roster_min", "roster_max"
         from "auction_rule_set" where "auction_id" = $1`,
      [input.auctionId],
    );
    const rules = rulesResult.rows[0]!;
    const bidIncrement = rules.bid_increment ?? 0;

    const currentBid = await currentAcceptedBid(client, current.id);
    const next = nextBidAmount({
      bidIncrement,
      currentAmount: currentBid?.amount ?? null,
      startingPrice: current.starting_price,
    });

    const state = await loadTeamRosterCount(
      client,
      input.auctionId,
      input.teamId,
    );

    let reason: BidRejectionReason | null = null;
    if (currentBid && currentBid.teamId === input.teamId)
      reason = "already_leading";
    else if (amount !== next) reason = "wrong_amount";
    else if (state.spent + amount > (rules.budget ?? 0))
      reason = "insufficient_budget";
    else if (
      rules.roster_max !== null &&
      state.rosterCount + 1 > rules.roster_max
    )
      reason = "roster_max_reached";
    else if (current.tier_id) {
      const tier = await client.query<{ max_per_team: number }>(
        `select "max_per_team" from "tier" where "id" = $1`,
        [current.tier_id],
      );
      const max = tier.rows[0]?.max_per_team;
      if (
        max !== undefined &&
        (state.tierCounts.get(current.tier_id) ?? 0) + 1 > max
      ) {
        reason = "tier_max_reached";
      }
    }

    if (!reason) {
      const possible = await bidKeepsLegalCompletion(client, {
        amount,
        auctionId: input.auctionId,
        excludePlayerEntryId: current.player_entry_id,
        playerTierId: current.tier_id,
        rulesMode: auction.rulesMode,
        teamId: input.teamId,
      });
      if (!possible) reason = "no_legal_completion";
    }

    if (reason) {
      const outcome = reject(reason, auction.revision);
      await record(reason);
      await storeCommand(client, {
        actorUserId: input.actorUserId,
        auctionId: input.auctionId,
        commandId: input.commandId,
        kind: "place_bid",
        result: { reason, status: "rejected" } satisfies StoredBidOutcome,
      });
      await client.query("commit");
      return outcome;
    }

    let insert;
    try {
      insert = await client.query<{ id: string }>(
        `insert into "bid_attempt"
            ("auction_id", "presentation_id", "team_id", "actor_user_id",
             "command_id", "amount", "status", "reason")
         values ($1, $2, $3, $4, $5, $6, 'accepted', null)
         returning "id"`,
        [
          input.auctionId,
          current.id,
          input.teamId,
          input.actorUserId,
          input.commandId,
          amount,
        ],
      );
    } catch (error) {
      // The unique accepted-price index proves another transaction already won
      // this price. The Auction lock should prevent it; treat it as a race loss.
      if (isUniqueViolation(error)) {
        await client.query("rollback");
        return reject("wrong_amount", auction.revision);
      }
      throw error;
    }

    // A valid Bid during a Manual Close warning cancels the warning and reopens
    // bidding in the same transaction.
    if (current.state === "closing" || current.warning_deadline) {
      await client.query(
        `update "player_presentation"
            set "state" = 'open', "warning_deadline" = null, "updated_at" = now()
          where "id" = $1`,
        [current.id],
      );
    }

    const revision = await bumpRevision(
      client,
      input.auctionId,
      "bid_accepted",
      {
        amount,
        presentationId: current.id,
        teamId: input.teamId,
      },
    );

    const result: PlaceBidResult = {
      amount,
      bidAttemptId: insert.rows[0]!.id,
      presentationId: current.id,
      teamId: input.teamId,
    };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "place_bid",
      result: { ...result, status: "accepted" } satisfies StoredBidOutcome,
    });
    await writeAuditEntry(client, {
      action: "place_bid",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: { amount, presentationId: current.id, teamId: input.teamId },
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

function reject(
  reason: BidRejectionReason,
  revision: number,
): LiveCommandOutcome<PlaceBidResult> {
  return {
    message: BID_REJECTION_MESSAGES[reason],
    reason,
    revision,
    status: "rejected",
  };
}

function replayStored(
  stored: StoredBidOutcome,
  revision: number,
): LiveCommandOutcome<PlaceBidResult> {
  if (stored.status === "accepted") {
    return {
      result: {
        amount: stored.amount,
        bidAttemptId: stored.bidAttemptId,
        presentationId: stored.presentationId,
        teamId: stored.teamId,
      },
      revision,
      status: "replayed",
    };
  }
  return {
    message: BID_REJECTION_MESSAGES[stored.reason],
    reason: stored.reason,
    revision,
    status: "rejected",
  };
}

async function recordRejection(
  client: PoolClient,
  {
    actorUserId,
    amount,
    auctionId,
    commandId,
    presentationId,
    reason,
    teamId,
  }: {
    actorUserId: string;
    amount: number;
    auctionId: string;
    commandId: string;
    presentationId: null | string;
    reason: BidRejectionReason;
    teamId: string;
  },
): Promise<void> {
  if (!presentationId) return;
  await client.query(
    `insert into "bid_attempt"
        ("auction_id", "presentation_id", "team_id", "actor_user_id",
         "command_id", "amount", "status", "reason")
     values ($1, $2, $3, $4, $5, $6, 'rejected', $7)`,
    [auctionId, presentationId, teamId, actorUserId, commandId, amount, reason],
  );
}
