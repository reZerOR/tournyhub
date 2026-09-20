import type { Pool } from "pg";

import type { RulesMode } from "@/domain/auction";
import { evaluateReadiness } from "@/domain/readiness";
import {
  isSimpleRuleSetComplete,
  isTieredRuleSetComplete,
  resolveOfferedStartingPrice,
} from "@/domain/rules";
import { lockEditableAuction } from "@/server/auction-command/lock-editable-auction";
import { loadReadinessInput } from "@/server/auction-query/readiness";
import { isUniqueViolation } from "@/server/database/pg-error";

/** A start that failed for a reason the Organizer can repair. */
export class AuctionStartError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "AuctionStartError";
    this.issues = issues;
  }
}

export interface StartedAuction {
  auctionId: string;
  disconnectedRepresentativeCount: number;
  revision: number;
}

/**
 * Starts a feasible Auction. Starting freezes Tier order and every Player's
 * resolved Starting Price into the first immutable Auction revision, moves the
 * Auction to Live, and offers no Player automatically. Player Representatives
 * are recorded as preassigned and never enter the biddable queue. Returns null
 * when the Auction is not editable by this Organizer.
 */
export async function startAuction(
  pool: Pool,
  organizerId: string,
  auctionId: string,
): Promise<null | StartedAuction> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const status = await lockEditableAuction(client, organizerId, auctionId);
    if (!status) {
      await client.query("rollback");
      return null;
    }

    const input = await loadReadinessInput(client, auctionId);
    const readiness = evaluateReadiness(input);
    if (!readiness.ready) {
      throw new AuctionStartError(
        "Resolve every Readiness error before starting the Auction.",
        readiness.errors.map((issue) => issue.message),
      );
    }

    const auction = await client.query<{ rules_mode: RulesMode }>(
      `select "rules_mode" from "auction" where "id" = $1`,
      [auctionId],
    );
    const rulesMode = auction.rows[0]?.rules_mode ?? "simple";
    // Readiness already required complete Rules; this narrows the nulls away
    // for the frozen revision payload.
    const ruleSet = input.ruleSet;
    if (rulesMode === "tiered") {
      if (!isTieredRuleSetComplete(ruleSet)) {
        throw new AuctionStartError(
          "Finish the Rules before starting the Auction.",
        );
      }
    } else if (!isSimpleRuleSetComplete(ruleSet)) {
      throw new AuctionStartError(
        "Finish the Rules before starting the Auction.",
      );
    }

    const live = await client.query(
      `select 1 from "auction" where "status" = 'live' and "id" <> $1`,
      [auctionId],
    );
    if (live.rowCount && live.rowCount > 0) {
      throw new AuctionStartError(
        "Another Auction is already Live. The beta allows one Live Auction at a time.",
      );
    }

    const entries = await client.query<{
      id: string;
      display_name: string;
      is_representative: boolean;
      starting_price_override: null | number;
      tier_id: null | string;
    }>(
      `select "id", "display_name", "is_representative",
              "starting_price_override", "tier_id"
         from "player_entry" where "auction_id" = $1
        order by "created_at" asc, "id" asc`,
      [auctionId],
    );
    const teams = await client.query<{
      id: string;
      name: null | string;
      position: number;
    }>(
      `select "id", "name", "position" from "team"
        where "auction_id" = $1
       order by "position" asc, "created_at" asc, "id" asc`,
      [auctionId],
    );
    const tiers = await client.query<{
      id: string;
      label: string;
      position: number;
      starting_price: number;
      min_per_team: number;
      max_per_team: number;
    }>(
      `select "id", "label", "position", "starting_price", "min_per_team",
              "max_per_team"
         from "tier" where "auction_id" = $1
        order by "position" asc, "created_at" asc, "id" asc`,
      [auctionId],
    );
    const time = await client.query<{ now: Date }>(`select now() as now`);

    const frozenTiers = tiers.rows;
    const tierStartingPrice = new Map(
      frozenTiers.map((tier) => [tier.id, tier.starting_price]),
    );
    const defaultStartingPrice = ruleSet.defaultStartingPrice ?? 0;

    const payload = {
      frozen_at: time.rows[0]!.now.toISOString(),
      players: entries.rows.map((entry) => ({
        display_name: entry.display_name,
        id: entry.id,
        is_representative: entry.is_representative,
        starting_price: resolveOfferedStartingPrice({
          defaultStartingPrice,
          startingPriceOverride: entry.starting_price_override,
          tierStartingPrice:
            rulesMode === "tiered" && entry.tier_id
              ? (tierStartingPrice.get(entry.tier_id) ?? null)
              : null,
        }),
        tier_id: entry.tier_id,
      })),
      rules: {
        bid_increment: ruleSet.bidIncrement,
        budget: ruleSet.budget,
        default_starting_price: ruleSet.defaultStartingPrice,
        roster_max: ruleSet.rosterMax,
        roster_min: ruleSet.rosterMin,
        rules_mode: rulesMode,
      },
      teams: teams.rows.map((team) => ({
        id: team.id,
        name: team.name,
        position: team.position,
      })),
      tiers: frozenTiers.map((tier) => ({
        id: tier.id,
        label: tier.label,
        max_per_team: tier.max_per_team,
        min_per_team: tier.min_per_team,
        position: tier.position,
        starting_price: tier.starting_price,
      })),
    };

    await client.query(
      `insert into "auction_revision" ("auction_id", "revision", "payload")
       values ($1, 1, $2::jsonb)`,
      [auctionId, JSON.stringify(payload)],
    );
    const activeTier = rulesMode === "tiered" ? (frozenTiers[0] ?? null) : null;
    await client.query(
      `update "auction"
          set "status" = 'live',
              "revision" = 1,
              "active_tier_id" = $2,
              "updated_at" = now()
        where "id" = $1`,
      [auctionId, activeTier?.id ?? null],
    );
    await client.query("commit");

    return {
      auctionId,
      disconnectedRepresentativeCount:
        input.disconnectedRepresentativeUserIds.length,
      revision: 1,
    };
  } catch (error) {
    await client.query("rollback");
    if (isUniqueViolation(error)) {
      throw new AuctionStartError(
        "Another Auction is already Live. The beta allows one Live Auction at a time.",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}
