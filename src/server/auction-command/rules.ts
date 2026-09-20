import type { Pool } from "pg";

import type { RulesMode } from "@/domain/auction";
import {
  simpleRulesInputSchema,
  type AuctionRuleSet,
  type SimpleRulesInput,
} from "@/domain/rules";
import {
  lockEditableAuction,
  markAuctionDraft,
} from "@/server/auction-command/lock-editable-auction";
import { mapRuleSetRow, type RuleSetRow } from "@/server/auction-query/rules";

/** A Rules rule the Organizer can repair, as opposed to an unexpected failure. */
export class RuleSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleSetupError";
  }
}

/**
 * Saves the shared Simple Rules. Every Team uses the same Budget, Bid
 * Increment, total Roster limits, and default Starting Price. Returns null
 * when the Auction is not editable by this Organizer.
 */
export async function saveSimpleRules(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  input: SimpleRulesInput,
): Promise<null | AuctionRuleSet> {
  const parsed = simpleRulesInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }

    const auction = await client.query<{ rules_mode: RulesMode }>(
      `select "rules_mode" from "auction" where "id" = $1`,
      [auctionId],
    );
    if (auction.rows[0]?.rules_mode === "tiered") {
      await client.query("rollback");
      throw new RuleSetupError(
        "This Auction uses Tiered Rules. Tier configuration arrives in a later step.",
      );
    }

    const saved = await client.query<RuleSetRow>(
      `insert into "auction_rule_set"
          ("auction_id", "roster_min", "roster_max", "budget", "bid_increment",
           "default_starting_price")
       values ($1, $2, $3, $4, $5, $6)
       on conflict ("auction_id") do update
         set "roster_min" = excluded."roster_min",
             "roster_max" = excluded."roster_max",
             "budget" = excluded."budget",
             "bid_increment" = excluded."bid_increment",
             "default_starting_price" = excluded."default_starting_price",
             "updated_at" = now()
       returning *`,
      [
        auctionId,
        parsed.rosterMin,
        parsed.rosterMax,
        parsed.budget,
        parsed.bidIncrement,
        parsed.defaultStartingPrice,
      ],
    );
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return mapRuleSetRow(saved.rows[0]!);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
