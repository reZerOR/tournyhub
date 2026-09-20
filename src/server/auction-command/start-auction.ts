import type { Pool } from "pg";

import { evaluateReadiness } from "@/domain/readiness";
import { isSimpleRuleSetComplete, resolveStartingPrice } from "@/domain/rules";
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
 * Starts a feasible Auction. Starting freezes every Player's resolved Starting
 * Price into the first immutable Auction revision, moves the Auction to Live,
 * and offers no Player automatically. Returns null when the Auction is not
 * editable by this Organizer.
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
    // Readiness already required complete Rules; this narrows the nulls away
    // for the frozen revision payload.
    if (!isSimpleRuleSetComplete(input.ruleSet)) {
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

    const ruleSet = input.ruleSet;
    const [entries, teams, time] = await Promise.all([
      client.query<{
        display_name: string;
        id: string;
        is_representative: boolean;
        starting_price_override: null | number;
      }>(
        `select "id", "display_name", "is_representative", "starting_price_override"
           from "player_entry" where "auction_id" = $1
          order by "created_at" asc, "id" asc`,
        [auctionId],
      ),
      client.query<{ id: string; name: null | string; position: number }>(
        `select "id", "name", "position" from "team"
          where "auction_id" = $1
         order by "position" asc, "created_at" asc, "id" asc`,
        [auctionId],
      ),
      client.query<{ now: Date }>(`select now() as now`),
    ]);

    const payload = {
      frozen_at: time.rows[0]!.now.toISOString(),
      players: entries.rows.map((entry) => ({
        display_name: entry.display_name,
        id: entry.id,
        is_representative: entry.is_representative,
        starting_price: resolveStartingPrice(
          entry.starting_price_override,
          ruleSet.defaultStartingPrice,
        ),
      })),
      rules: {
        bid_increment: ruleSet.bidIncrement,
        budget: ruleSet.budget,
        default_starting_price: ruleSet.defaultStartingPrice,
        roster_max: ruleSet.rosterMax,
        roster_min: ruleSet.rosterMin,
      },
      teams: teams.rows.map((team) => ({
        id: team.id,
        name: team.name,
        position: team.position,
      })),
    };

    await client.query(
      `insert into "auction_revision" ("auction_id", "revision", "payload")
       values ($1, 1, $2::jsonb)`,
      [auctionId, JSON.stringify(payload)],
    );
    await client.query(
      `update "auction"
          set "status" = 'live', "revision" = 1, "updated_at" = now()
        where "id" = $1`,
      [auctionId],
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
