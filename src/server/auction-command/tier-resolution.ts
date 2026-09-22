import type { Pool } from "pg";

import {
  LIFECYCLE_REJECTION_MESSAGES,
  type LifecycleRejectionReason,
} from "@/domain/live";
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
import { loadRuleSet } from "@/server/auction-query/rules";
import { loadTierRow } from "@/server/auction-query/tiers";

export interface ResolveRemainingPlayerInput {
  actorUserId: string;
  auctionId: string;
  commandId: string;
  expectedRevision: number;
  playerEntryId: string;
  pricing: "average" | "base";
  teamId: string;
  tierId: string;
}

export interface ResolveRemainingPlayerResult {
  amount: number;
  playerEntryId: string;
  saleId: string;
  teamId: string;
}

function reject<T>(
  reason: LifecycleRejectionReason,
  revision: number,
  customMessage?: string,
): LiveCommandOutcome<T> {
  return rejection(
    customMessage ?? LIFECYCLE_REJECTION_MESSAGES[reason],
    reason,
    revision,
  );
}

/**
 * Resolves the final remaining Player in a Tier to the sole remaining eligible
 * Team, at either the average price of previous sales in that Tier or the base
 * Starting Price.
 */
export async function resolveRemainingTierPlayer(
  pool: Pool,
  input: ResolveRemainingPlayerInput,
): Promise<LiveCommandOutcome<ResolveRemainingPlayerResult>> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const auction = await lockLiveAuction(client, input.auctionId);
    if (!auction || auction.organizerId !== input.actorUserId) {
      await client.query("rollback");
      return { status: "unauthorized" };
    }

    const stored = await findStoredCommand<ResolveRemainingPlayerResult>(
      client,
      input.auctionId,
      input.commandId,
    );
    if (stored) {
      await client.query("rollback");
      return stored.actorUserId === input.actorUserId
        ? { result: stored.result, revision: auction.revision, status: "replayed" }
        : { status: "unauthorized" };
    }

    if (auction.status !== "live" && auction.status !== "paused") {
      await client.query("rollback");
      return reject("auction_not_live", auction.revision);
    }
    if (input.expectedRevision !== auction.revision) {
      await client.query("rollback");
      return reject("stale_revision", auction.revision);
    }
    if (auction.rulesMode !== "tiered") {
      await client.query("rollback");
      return reject("tier_not_in_auction", auction.revision, "This Auction does not use Tiered rules.");
    }
    if (auction.activeTierId !== input.tierId) {
      await client.query("rollback");
      return reject("tier_not_in_auction", auction.revision, "That Tier is not currently active.");
    }

    const tier = await loadTierRow(client, input.auctionId, input.tierId);
    if (!tier) {
      await client.query("rollback");
      return reject("tier_not_in_auction", auction.revision);
    }

    // Verify player belongs to this tier and is not sold
    const playerResult = await client.query<{
      display_name: string;
      id: string;
      starting_price_override: null | number;
      tier_id: string;
    }>(
      `select pe."id", pe."display_name", pe."starting_price_override", pe."tier_id"
         from "player_entry" pe
        where pe."id" = $1 and pe."auction_id" = $2 and not pe."is_representative"
          and not exists (
            select 1 from "sale" s
             where s."player_entry_id" = pe."id" and s."reversed_at" is null)`,
      [input.playerEntryId, input.auctionId],
    );
    const player = playerResult.rows[0];
    if (!player || player.tier_id !== input.tierId) {
      await client.query("rollback");
      return reject(
        "tier_not_in_auction",
        auction.revision,
        "That Player is not available in this Tier.",
      );
    }

    // Verify exactly 1 player remains in this tier
    const remainingPlayersResult = await client.query<{ id: string }>(
      `select pe."id"
         from "player_entry" pe
        where pe."auction_id" = $1 and pe."tier_id" = $2 and not pe."is_representative"
          and not exists (
            select 1 from "sale" s
             where s."player_entry_id" = pe."id" and s."reversed_at" is null)`,
      [input.auctionId, input.tierId],
    );
    if (
      remainingPlayersResult.rows.length !== 1 ||
      remainingPlayersResult.rows[0]?.id !== input.playerEntryId
    ) {
      await client.query("rollback");
      return reject(
        "no_eligible_players",
        auction.revision,
        "Resolution is only available when exactly one Player remains in the Tier.",
      );
    }

    // Check eligible teams for this tier
    const teamsResult = await client.query<{ id: string }>(
      `select "id" from "team" where "auction_id" = $1`,
      [input.auctionId],
    );
    const tierCountsResult = await client.query<{ count: number; team_id: string }>(
      `select pe."team_id", count(*)::int as count
         from "player_entry" pe
        where pe."auction_id" = $1 and pe."tier_id" = $2 and pe."team_id" is not null and pe."is_representative"
        group by pe."team_id"
       union all
       select s."team_id", count(*)::int as count
         from "sale" s
         join "player_entry" pe on pe."id" = s."player_entry_id"
        where s."auction_id" = $1 and pe."tier_id" = $2 and s."reversed_at" is null
        group by s."team_id"`,
      [input.auctionId, input.tierId],
    );
    const countsByTeam = new Map<string, number>();
    for (const row of tierCountsResult.rows) {
      countsByTeam.set(row.team_id, (countsByTeam.get(row.team_id) ?? 0) + row.count);
    }
    const eligibleTeams = teamsResult.rows.filter(
      (t) => (countsByTeam.get(t.id) ?? 0) < tier.max_per_team,
    );
    if (eligibleTeams.length !== 1 || eligibleTeams[0]?.id !== input.teamId) {
      await client.query("rollback");
      return reject(
        "matching_required",
        auction.revision,
        "Resolution is only available when exactly one eligible Team remains in the Tier.",
      );
    }

    // Calculate sale price
    const basePrice = player.starting_price_override ?? tier.starting_price;
    let finalAmount = basePrice;
    if (input.pricing === "average") {
      const avgResult = await client.query<{ avg_price: number; count: number }>(
        `select coalesce(round(avg(s."amount")), 0)::int as avg_price,
                count(s."id")::int as count
           from "sale" s
           join "player_entry" pe on pe."id" = s."player_entry_id"
          where s."auction_id" = $1
            and pe."tier_id" = $2
            and s."reversed_at" is null`,
        [input.auctionId, input.tierId],
      );
      const avgRow = avgResult.rows[0];
      if (avgRow && avgRow.count > 0) {
        finalAmount = Math.max(1, avgRow.avg_price);
      }
    }

    // Verify team budget
    const rules = await loadRuleSet(client, input.auctionId);
    const budget = rules.budget ?? 0;
    const spendResult = await client.query<{ spent: number }>(
      `select coalesce(sum(s."amount"), 0)::int as spent
         from "sale" s
        where s."auction_id" = $1 and s."team_id" = $2 and s."reversed_at" is null`,
      [input.auctionId, input.teamId],
    );
    const spent = spendResult.rows[0]?.spent ?? 0;
    if (budget - spent < finalAmount) {
      await client.query("rollback");
      return reject(
        "minimums_unresolved",
        auction.revision,
        `The remaining Team has only ${budget - spent} Credits remaining, which is insufficient for ${finalAmount} Credits.`,
      );
    }

    // Handle presentation: if active for this player, close it as sold; otherwise create one
    const activeResult = await client.query<{
      id: string;
      player_entry_id: string;
      state: string;
    }>(
      `select "id", "player_entry_id", "state"
         from "player_presentation"
        where "auction_id" = $1 and "state" in ('open', 'closing')
        limit 1`,
      [input.auctionId],
    );
    const active = activeResult.rows[0];
    let presentationId: string;
    if (active) {
      if (active.player_entry_id !== input.playerEntryId) {
        await client.query("rollback");
        return reject("presentation_active", auction.revision);
      }
      await client.query(
        `update "player_presentation"
            set "state" = 'sold', "closed_at" = now()
          where "id" = $1`,
        [active.id],
      );
      presentationId = active.id;
    } else {
      const insertedPresentation = await client.query<{ id: string }>(
        `insert into "player_presentation"
            ("auction_id", "player_entry_id", "tier_id", "starting_price",
             "selection_method", "state", "close_mode", "opened_at", "closed_at")
         values ($1, $2, $3, $4, 'forced', 'sold', $5, now(), now())
         returning "id"`,
        [
          input.auctionId,
          input.playerEntryId,
          input.tierId,
          finalAmount,
          auction.closeMode,
        ],
      );
      presentationId = insertedPresentation.rows[0]!.id;
    }

    // Insert sale
    const saleResult = await client.query<{ id: string }>(
      `insert into "sale"
          ("auction_id", "presentation_id", "player_entry_id", "team_id",
           "amount", "source")
       values ($1, $2, $3, $4, $5, 'forced')
       returning "id"`,
      [input.auctionId, presentationId, input.playerEntryId, input.teamId, finalAmount],
    );
    const saleId = saleResult.rows[0]!.id;

    // Resolve unsold membership if any
    await client.query(
      `update "unsold_membership"
          set "resolved_at" = now(), "resolution" = 'assigned', "sale_id" = $2
        where "player_entry_id" = $1 and "resolved_at" is null`,
      [input.playerEntryId, saleId],
    );

    // Legal completion check
    if (
      !(await auctionKeepsLegalCompletion(client, {
        auctionId: input.auctionId,
        rulesMode: auction.rulesMode,
      }))
    ) {
      await client.query("rollback");
      return reject("no_feasible_matching", auction.revision);
    }

    const revision = await bumpRevision(
      client,
      input.auctionId,
      "forced_assignment",
      {
        amount: finalAmount,
        playerEntryId: input.playerEntryId,
        presentationId,
        pricing: input.pricing,
        saleId,
        teamId: input.teamId,
        tierId: input.tierId,
      },
    );

    await writeAuditEntry(client, {
      action: "tier_remaining_resolution",
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      details: {
        amount: finalAmount,
        playerEntryId: input.playerEntryId,
        pricing: input.pricing,
        teamId: input.teamId,
        tierId: input.tierId,
      },
    });

    const result: ResolveRemainingPlayerResult = {
      amount: finalAmount,
      playerEntryId: input.playerEntryId,
      saleId,
      teamId: input.teamId,
    };

    await storeCommand(client, {
      actorUserId: input.actorUserId,
      auctionId: input.auctionId,
      commandId: input.commandId,
      kind: "tier_remaining_resolution",
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
