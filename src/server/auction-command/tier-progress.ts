import type { Pool, PoolClient } from "pg";

import type { CloseMode } from "@/domain/auction";
import {
  LIFECYCLE_REJECTION_MESSAGES,
  type LifecycleRejectionReason,
} from "@/domain/live";
import { deficientTeamIds, matchUnsoldPlayers } from "@/domain/matching";
import type { Tier } from "@/domain/tier";
import { auctionKeepsLegalCompletion } from "@/server/auction-command/legal-completion-check";
import {
  bumpRevision,
  findStoredCommand,
  type LiveCommandOutcome,
  lockLiveAuction,
  rejection,
  storeCommand,
  writeAuditEntry,
} from "@/server/auction-command/live-command";
import { secureFraction } from "@/server/auction-command/secure-random";
import {
  countUnresolvedBiddablePlayers,
  loadOpenUnsoldRound,
  loadRoundOfferedPlayerIds,
  loadTeamMinimumStates,
  loadTierProgress,
  loadUnsoldPool,
  type TeamMinimumState,
  type UnsoldPoolEntry,
} from "@/server/auction-query/progress";
import { loadRuleSet } from "@/server/auction-query/rules";
import { loadTiers } from "@/server/auction-query/tiers";

export interface TierCommandInput {
  actorUserId: string;
  auctionId: string;
  commandId: string;
  expectedRevision: number;
}

/** A lifecycle or unsold-resolution rejection the Organizer can act on. */
function reject<T>(
  reason: LifecycleRejectionReason,
  revision: number,
): LiveCommandOutcome<T> {
  return rejection(LIFECYCLE_REJECTION_MESSAGES[reason], reason, revision);
}

async function authorizeOrganizer(
  client: PoolClient,
  input: TierCommandInput,
): Promise<
  | { auction: Awaited<ReturnType<typeof lockLiveAuction>> }
  | { outcome: LiveCommandOutcome<never> }
> {
  const auction = await lockLiveAuction(client, input.auctionId);
  if (!auction || auction.organizerId !== input.actorUserId) {
    return { outcome: { status: "unauthorized" } };
  }
  return { auction };
}

async function replay<T>(
  client: PoolClient,
  input: TierCommandInput,
  revision: number,
): Promise<null | LiveCommandOutcome<T>> {
  const stored = await findStoredCommand<T>(
    client,
    input.auctionId,
    input.commandId,
  );
  if (!stored) return null;
  return stored.actorUserId === input.actorUserId
    ? { result: stored.result, revision, status: "replayed" }
    : { status: "unauthorized" };
}

/**
 * Activates the next Tier once every earlier Tier has finished. Tier order is
 * authoritative: the Organizer cannot skip a Tier whose Players were never
 * offered, and cannot activate anything while a Player is Active.
 */
export async function activateTier(
  pool: Pool,
  input: TierCommandInput & { tierId: string },
): Promise<LiveCommandOutcome<{ tierId: string }>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const authorized = await authorizeOrganizer(client, input);
    if ("outcome" in authorized) {
      await client.query("rollback");
      return authorized.outcome as LiveCommandOutcome<{ tierId: string }>;
    }
    const auction = authorized.auction!;

    const replayed = await replay<{ tierId: string }>(
      client,
      input,
      auction.revision,
    );
    if (replayed) {
      await client.query("rollback");
      return replayed;
    }

    if (auction.status !== "live") {
      await client.query("rollback");
      return reject("auction_not_live", auction.revision);
    }
    if (input.expectedRevision !== auction.revision) {
      await client.query("rollback");
      return reject("stale_revision", auction.revision);
    }
    if (await loadOpenUnsoldRound(client, input.auctionId)) {
      await client.query("rollback");
      return reject("unsold_round_open", auction.revision);
    }
    const active = await client.query(
      `select 1 from "player_presentation"
        where "auction_id" = $1 and "state" in ('open', 'closing')`,
      [input.auctionId],
    );
    if (active.rowCount && active.rowCount > 0) {
      await client.query("rollback");
      return reject("presentation_active", auction.revision);
    }

    const tiers = await loadTiers(client, input.auctionId);
    const targetIndex = tiers.findIndex((tier) => tier.id === input.tierId);
    if (targetIndex === -1) {
      await client.query("rollback");
      return reject("tier_not_in_auction", auction.revision);
    }

    const progress = await loadTierProgress(client, input.auctionId);
    const incompleteBeforeTarget = progress
      .slice(0, targetIndex)
      .some((tier) => tier.offeredCount < tier.biddableCount);
    if (incompleteBeforeTarget) {
      await client.query("rollback");
      return reject("tier_progress_incomplete", auction.revision);
    }
    const target = progress[targetIndex]!;
    if (target.offeredCount >= target.biddableCount) {
      await client.query("rollback");
      return reject("no_next_tier", auction.revision);
    }

    await client.query(
      `update "auction" set "active_tier_id" = $2, "updated_at" = now()
        where "id" = $1`,
      [input.auctionId, input.tierId],
    );
    const revision = await bumpRevision(
      client,
      input.auctionId,
      "tier_activated",
      { tierId: input.tierId },
    );
    await writeAuditEntry(client, {
      action: "activate_tier",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: { tierId: input.tierId },
    });

    const result = { tierId: input.tierId };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "activate_tier",
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
 * Opens an Unsold Round once the current offering queue is finished. The round
 * offers only Unsold Pool Players, and the Organizer may open another round as
 * often as needed while any Pool Player remains.
 */
export async function startUnsoldRound(
  pool: Pool,
  input: TierCommandInput,
): Promise<LiveCommandOutcome<{ roundId: string; sequence: number }>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const authorized = await authorizeOrganizer(client, input);
    if ("outcome" in authorized) {
      await client.query("rollback");
      return authorized.outcome as LiveCommandOutcome<{
        roundId: string;
        sequence: number;
      }>;
    }
    const auction = authorized.auction!;

    const replayed = await replay<{ roundId: string; sequence: number }>(
      client,
      input,
      auction.revision,
    );
    if (replayed) {
      await client.query("rollback");
      return replayed;
    }

    if (auction.status !== "live") {
      await client.query("rollback");
      return reject("auction_not_live", auction.revision);
    }
    if (input.expectedRevision !== auction.revision) {
      await client.query("rollback");
      return reject("stale_revision", auction.revision);
    }
    if (await loadOpenUnsoldRound(client, input.auctionId)) {
      await client.query("rollback");
      return reject("unsold_round_open", auction.revision);
    }
    const active = await client.query(
      `select 1 from "player_presentation"
        where "auction_id" = $1 and "state" in ('open', 'closing')`,
      [input.auctionId],
    );
    if (active.rowCount && active.rowCount > 0) {
      await client.query("rollback");
      return reject("presentation_active", auction.revision);
    }

    // Under Tiered Rules only the Active Tier has to be finished: the Pool can
    // hold nothing else, because Players in a later Tier have never been
    // offered. Under Simple Rules the whole queue is the offering scope.
    const queueIncomplete =
      auction.rulesMode === "tiered"
        ? await activeTierIncomplete(client, input.auctionId)
        : (await countUnresolvedBiddablePlayers(client, input.auctionId)) > 0;
    if (queueIncomplete) {
      await client.query("rollback");
      return reject("tier_progress_incomplete", auction.revision);
    }

    const rules = await loadRuleSet(client, input.auctionId);
    const unsoldPool = await loadUnsoldPool(
      client,
      input.auctionId,
      rules.defaultStartingPrice ?? 0,
    );
    if (unsoldPool.length === 0) {
      await client.query("rollback");
      return reject("no_eligible_players", auction.revision);
    }

    const next = await client.query<{ sequence: number }>(
      `select coalesce(max("sequence"), 0) + 1 as sequence
         from "unsold_round" where "auction_id" = $1`,
      [input.auctionId],
    );
    const sequence = next.rows[0]!.sequence;
    const inserted = await client.query<{ id: string }>(
      `insert into "unsold_round" ("auction_id", "sequence")
       values ($1, $2)
       returning "id"`,
      [input.auctionId, sequence],
    );
    const roundId = inserted.rows[0]!.id;

    const revision = await bumpRevision(
      client,
      input.auctionId,
      "unsold_round_opened",
      { eligibleCount: unsoldPool.length, roundId, sequence },
    );
    await writeAuditEntry(client, {
      action: "start_unsold_round",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: {
        eligibleCount: unsoldPool.length,
        playerEntryIds: unsoldPool.map((entry) => entry.playerEntryId),
        roundId,
        sequence,
      },
    });

    const result = { roundId, sequence };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "start_unsold_round",
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
 * Whether the Tier currently being offered still holds Players that have never
 * been presented. An Auction with no Active Tier must have every Tier finished.
 */
async function activeTierIncomplete(
  client: PoolClient,
  auctionId: string,
): Promise<boolean> {
  const progress = await loadTierProgress(client, auctionId);
  const auction = await client.query<{ active_tier_id: null | string }>(
    `select "active_tier_id" from "auction" where "id" = $1`,
    [auctionId],
  );
  const activeTierId = auction.rows[0]?.active_tier_id ?? null;
  return progress.some(
    (tier) =>
      tier.offeredCount < tier.biddableCount &&
      (activeTierId === null || tier.id === activeTierId),
  );
}

/**
 * Creates one Forced Assignment: a Sale at the Player's frozen Starting Price
 * with no Bid. The Roster, Tier count, spent Credits, and remaining Credits
 * all follow from the committed Sale row.
 */
async function applyForcedAssignment(
  client: PoolClient,
  {
    actorUserId,
    amount,
    auctionId,
    closeMode,
    player,
    roundId,
    teamId,
  }: {
    actorUserId: string;
    amount: number;
    auctionId: string;
    closeMode: CloseMode;
    player: UnsoldPoolEntry;
    roundId: string;
    teamId: string;
  },
): Promise<{ presentationId: string; saleId: string }> {
  const presentation = await client.query<{ id: string }>(
    `insert into "player_presentation"
        ("auction_id", "player_entry_id", "tier_id", "starting_price",
         "selection_method", "state", "close_mode", "opened_at", "closed_at",
         "unsold_round_id")
     values ($1, $2, $3, $4, 'forced', 'sold', $5, now(), now(), $6)
     returning "id"`,
    [
      auctionId,
      player.playerEntryId,
      player.tierId,
      amount,
      closeMode,
      roundId,
    ],
  );
  const presentationId = presentation.rows[0]!.id;

  const sale = await client.query<{ id: string }>(
    `insert into "sale"
        ("auction_id", "presentation_id", "player_entry_id", "team_id",
         "amount", "source")
     values ($1, $2, $3, $4, $5, 'forced')
     returning "id"`,
    [auctionId, presentationId, player.playerEntryId, teamId, amount],
  );
  const saleId = sale.rows[0]!.id;

  await client.query(
    `update "unsold_membership"
        set "resolved_at" = now(), "resolution" = 'assigned', "sale_id" = $2
      where "player_entry_id" = $1 and "resolved_at" is null`,
    [player.playerEntryId, saleId],
  );
  await writeAuditEntry(client, {
    action: "forced_assignment",
    actorUserId,
    auctionId,
    details: {
      amount,
      playerEntryId: player.playerEntryId,
      saleId,
      teamId,
    },
  });

  return { presentationId, saleId };
}

export interface CloseUnsoldPoolResult {
  kind: "final_unsold" | "forced" | "round_closed";
  finalUnsoldCount: number;
  roundId: string;
}

/**
 * Closes the Unsold Pool.
 *
 * - When every Team already meets its minimums, the remaining Pool Players
 *   become Final Unsold.
 * - When exactly one deficient Team and one eligible Player remain, closing
 *   creates the Forced Assignment instead.
 * - When the round has nothing left to offer, it simply closes: the resolution
 *   flows have nothing to work with, and the Organizer may open another round.
 * - Anything larger must go through constrained matching, so the Organizer
 *   cannot hand-pick pairings.
 */
export async function closeUnsoldPool(
  pool: Pool,
  input: TierCommandInput,
): Promise<LiveCommandOutcome<CloseUnsoldPoolResult>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const authorized = await authorizeOrganizer(client, input);
    if ("outcome" in authorized) {
      await client.query("rollback");
      return authorized.outcome as LiveCommandOutcome<CloseUnsoldPoolResult>;
    }
    const auction = authorized.auction!;

    const replayed = await replay<CloseUnsoldPoolResult>(
      client,
      input,
      auction.revision,
    );
    if (replayed) {
      await client.query("rollback");
      return replayed;
    }

    if (auction.status !== "live") {
      await client.query("rollback");
      return reject("auction_not_live", auction.revision);
    }
    if (input.expectedRevision !== auction.revision) {
      await client.query("rollback");
      return reject("stale_revision", auction.revision);
    }
    const round = await loadOpenUnsoldRound(client, input.auctionId);
    if (!round) {
      await client.query("rollback");
      return reject("no_unsold_round", auction.revision);
    }
    const active = await client.query(
      `select 1 from "player_presentation"
        where "auction_id" = $1 and "state" in ('open', 'closing')`,
      [input.auctionId],
    );
    if (active.rowCount && active.rowCount > 0) {
      await client.query("rollback");
      return reject("presentation_active", auction.revision);
    }

    const state = await loadUnsoldState(client, input.auctionId, round.id);
    const deficient = deficientTeamIds({
      rosterMin: state.rosterMin,
      teams: state.teams,
      tiers: state.tiers,
    });

    if (deficient.length === 0) {
      const resolved = await client.query<{ count: number }>(
        `update "unsold_membership"
            set "resolved_at" = now(), "resolution" = 'final_unsold'
          where "auction_id" = $1 and "resolved_at" is null
          returning "player_entry_id"`,
        [input.auctionId],
      );
      await closeRound(client, round.id);
      const revision = await bumpRevision(
        client,
        input.auctionId,
        "unsold_pool_closed",
        { finalUnsoldCount: resolved.rowCount ?? 0, roundId: round.id },
      );
      await writeAuditEntry(client, {
        action: "close_unsold_pool",
        actorUserId: input.actorUserId,
        auctionId: input.auctionId,
        details: {
          finalUnsoldCount: resolved.rowCount ?? 0,
          roundId: round.id,
        },
      });

      const result: CloseUnsoldPoolResult = {
        finalUnsoldCount: resolved.rowCount ?? 0,
        kind: "final_unsold",
        roundId: round.id,
      };
      await storeCommand(client, {
        actorUserId: input.actorUserId,
        auctionId: input.auctionId,
        commandId: input.commandId,
        kind: "close_unsold_pool",
        result,
      });
      await client.query("commit");
      return { result, revision, status: "accepted" };
    }

    // The round has nothing left to offer, so neither resolution flow applies.
    // Closing it lets the Organizer open another round over the same Pool. This
    // is checked before the matching requirement, because matching has nothing
    // to work with once the round is exhausted.
    if (state.eligible.length === 0) {
      await closeRound(client, round.id);
      const revision = await bumpRevision(
        client,
        input.auctionId,
        "unsold_round_closed",
        { roundId: round.id },
      );
      await writeAuditEntry(client, {
        action: "close_unsold_pool",
        actorUserId: input.actorUserId,
        auctionId: input.auctionId,
        details: { roundId: round.id, unresolvedMinimums: deficient.length },
      });

      const result: CloseUnsoldPoolResult = {
        finalUnsoldCount: 0,
        kind: "round_closed",
        roundId: round.id,
      };
      await storeCommand(client, {
        actorUserId: input.actorUserId,
        auctionId: input.auctionId,
        commandId: input.commandId,
        kind: "close_unsold_pool",
        result,
      });
      await client.query("commit");
      return { result, revision, status: "accepted" };
    }

    if (state.eligible.length > 1 || deficient.length > 1) {
      await client.query("rollback");
      return reject("matching_required", auction.revision);
    }

    const player = state.eligible[0]!;
    const assignment = await applyForcedAssignment(client, {
      actorUserId: input.actorUserId,
      amount: player.startingPrice,
      auctionId: input.auctionId,
      closeMode: auction.closeMode,
      player,
      roundId: round.id,
      teamId: deficient[0]!,
    });
    if (
      !(await auctionKeepsLegalCompletion(client, {
        auctionId: input.auctionId,
        rulesMode: auction.rulesMode,
      }))
    ) {
      await client.query("rollback");
      return reject("no_feasible_matching", auction.revision);
    }
    await closeRound(client, round.id);
    const revision = await bumpRevision(
      client,
      input.auctionId,
      "forced_assignment",
      {
        amount: player.startingPrice,
        playerEntryId: player.playerEntryId,
        presentationId: assignment.presentationId,
        roundId: round.id,
        saleId: assignment.saleId,
        teamId: deficient[0]!,
      },
    );
    const result: CloseUnsoldPoolResult = {
      finalUnsoldCount: 0,
      kind: "forced",
      roundId: round.id,
    };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "close_unsold_pool",
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

async function closeRound(client: PoolClient, roundId: string): Promise<void> {
  await client.query(
    `update "unsold_round" set "status" = 'closed', "closed_at" = now()
      where "id" = $1`,
    [roundId],
  );
}

interface UnsoldState {
  /** Unresolved pool Players that this round has not completed yet. */
  eligible: UnsoldPoolEntry[];
  /** Every unresolved pool Player, offered this round or not. */
  pool: UnsoldPoolEntry[];
  rosterMax: number;
  rosterMin: number;
  teams: TeamMinimumState[];
  tiers: Tier[];
}

async function loadUnsoldState(
  client: PoolClient,
  auctionId: string,
  roundId: null | string,
): Promise<UnsoldState> {
  const tiers = await loadTiers(client, auctionId);
  const rules = await loadRuleSet(client, auctionId);
  const teams = await loadTeamMinimumStates(
    client,
    auctionId,
    tiers.map((tier) => tier.id),
  );
  const pool = await loadUnsoldPool(
    client,
    auctionId,
    rules.defaultStartingPrice ?? 0,
  );
  const offered = roundId
    ? await loadRoundOfferedPlayerIds(client, roundId)
    : new Set<string>();
  return {
    eligible: pool.filter((entry) => !offered.has(entry.playerEntryId)),
    pool,
    rosterMax: rules.rosterMax ?? 0,
    rosterMin: rules.rosterMin ?? 0,
    teams,
    tiers,
  };
}

export interface MatchingResultView {
  assignments: { amount: number; playerEntryId: string; teamId: string }[];
  roundId: string;
}

/**
 * Resolves the remaining minimums by constrained random matching. The engine
 * considers only complete assignments that respect Budget, total and Tier
 * minimums and maximums, and every committed Sale, then secure randomness
 * picks among the feasible assignments. The inputs and the chosen result are
 * recorded for audit.
 */
export async function requestConstrainedMatching(
  pool: Pool,
  input: TierCommandInput & { random?: () => number },
): Promise<LiveCommandOutcome<MatchingResultView>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const authorized = await authorizeOrganizer(client, input);
    if ("outcome" in authorized) {
      await client.query("rollback");
      return authorized.outcome as LiveCommandOutcome<MatchingResultView>;
    }
    const auction = authorized.auction!;

    const replayed = await replay<MatchingResultView>(
      client,
      input,
      auction.revision,
    );
    if (replayed) {
      await client.query("rollback");
      return replayed;
    }

    if (auction.status !== "live") {
      await client.query("rollback");
      return reject("auction_not_live", auction.revision);
    }
    if (input.expectedRevision !== auction.revision) {
      await client.query("rollback");
      return reject("stale_revision", auction.revision);
    }
    const round = await loadOpenUnsoldRound(client, input.auctionId);
    if (!round) {
      await client.query("rollback");
      return reject("no_unsold_round", auction.revision);
    }
    const active = await client.query(
      `select 1 from "player_presentation"
        where "auction_id" = $1 and "state" in ('open', 'closing')`,
      [input.auctionId],
    );
    if (active.rowCount && active.rowCount > 0) {
      await client.query("rollback");
      return reject("presentation_active", auction.revision);
    }

    const state = await loadUnsoldState(client, input.auctionId, round.id);
    const deficient = deficientTeamIds({
      rosterMin: state.rosterMin,
      teams: state.teams,
      tiers: state.tiers,
    });
    if (deficient.length === 0 || state.eligible.length === 0) {
      await client.query("rollback");
      return reject("minimums_unresolved", auction.revision);
    }

    const rules = await loadRuleSet(client, input.auctionId);
    const tierIndexById = new Map(
      state.tiers.map((tier, index) => [tier.id, index]),
    );
    const matching = matchUnsoldPlayers({
      players: state.eligible.map((entry) => ({
        id: entry.playerEntryId,
        startingPrice: entry.startingPrice,
        tierIndex: entry.tierId ? (tierIndexById.get(entry.tierId) ?? -1) : -1,
      })),
      random: input.random ?? secureFraction,
      rosterMax: state.rosterMax,
      rosterMin: state.rosterMin,
      teams: state.teams.map((team) => ({
        budget: rules.budget ?? 0,
        id: team.id,
        preassignedByTier: team.tierCounts,
        preassignedTotal: team.rosterCount,
        spent: team.spentCredits,
      })),
      tiers: state.tiers.map((tier) => ({
        label: tier.label,
        maxPerTeam: tier.maxPerTeam,
        minPerTeam: tier.minPerTeam,
      })),
    });

    if (!matching.possible) {
      await client.query("rollback");
      return reject("no_feasible_matching", auction.revision);
    }

    const byPlayer = new Map(
      state.eligible.map((entry) => [entry.playerEntryId, entry]),
    );
    const assignments: MatchingResultView["assignments"] = [];
    for (const assignment of matching.assignments) {
      const player = byPlayer.get(assignment.playerId);
      if (!player) continue;
      await applyForcedAssignment(client, {
        actorUserId: input.actorUserId,
        amount: player.startingPrice,
        auctionId: input.auctionId,
        closeMode: auction.closeMode,
        player,
        roundId: round.id,
        teamId: assignment.teamId,
      });
      assignments.push({
        amount: player.startingPrice,
        playerEntryId: player.playerEntryId,
        teamId: assignment.teamId,
      });
    }

    // The round stays open: the Organizer decides when to close the Pool and
    // mark whatever is left Final Unsold.
    const revision = await bumpRevision(
      client,
      input.auctionId,
      "constrained_matching",
      {
        assignments,
        candidateCount: state.eligible.length,
        deficientTeamIds: deficient,
        roundId: round.id,
      },
    );
    await writeAuditEntry(client, {
      action: "constrained_matching",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: {
        assignments,
        candidates: state.eligible.map((entry) => ({
          playerEntryId: entry.playerEntryId,
          startingPrice: entry.startingPrice,
          tierId: entry.tierId,
        })),
        deficientTeamIds: deficient,
        roundId: round.id,
      },
    });

    const result: MatchingResultView = { assignments, roundId: round.id };
    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "request_matching",
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
