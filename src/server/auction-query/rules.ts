import { DEFAULT_TIMED_CLOSE_SECONDS } from "@/domain/live";
import type { AuctionRuleSet } from "@/domain/rules";
import { isEditableAuction } from "@/server/auction-query/editable";
import type { Queryable } from "@/server/database/queryable";

export interface RuleSetRow {
  auction_id: string;
  budget: null | number;
  bid_increment: null | number;
  default_starting_price: null | number;
  roster_max: null | number;
  roster_min: null | number;
  timed_close_seconds: number;
  updated_at: Date;
}

export function mapRuleSetRow(row: RuleSetRow): AuctionRuleSet {
  return {
    auctionId: row.auction_id,
    budget: row.budget,
    bidIncrement: row.bid_increment,
    defaultStartingPrice: row.default_starting_price,
    rosterMax: row.roster_max,
    rosterMin: row.roster_min,
    timedCloseSeconds: row.timed_close_seconds,
    updatedAt: row.updated_at,
  };
}

/** An empty Rule Set for an Auction that has not configured any Rules yet. */
export function emptyRuleSet(auctionId: string): AuctionRuleSet {
  return {
    auctionId,
    budget: null,
    bidIncrement: null,
    defaultStartingPrice: null,
    rosterMax: null,
    rosterMin: null,
    timedCloseSeconds: DEFAULT_TIMED_CLOSE_SECONDS,
    updatedAt: new Date(0),
  };
}

/**
 * This Auction's Rule Set, or an empty one when it has not configured Rules
 * yet. Returns null when the Auction is not editable for this Organizer.
 */
export async function getRuleSetForOrganizer(
  db: Queryable,
  organizerId: string,
  auctionId: string,
): Promise<null | AuctionRuleSet> {
  if (!(await isEditableAuction(db, organizerId, auctionId))) return null;

  const result = await db.query<RuleSetRow>(
    `select * from "auction_rule_set" where "auction_id" = $1`,
    [auctionId],
  );
  return result.rows[0]
    ? mapRuleSetRow(result.rows[0])
    : emptyRuleSet(auctionId);
}

/** This Auction's Rule Set without an authorization check, for internal composition. */
export async function loadRuleSet(
  db: Queryable,
  auctionId: string,
): Promise<AuctionRuleSet> {
  const result = await db.query<RuleSetRow>(
    `select * from "auction_rule_set" where "auction_id" = $1`,
    [auctionId],
  );
  return result.rows[0]
    ? mapRuleSetRow(result.rows[0])
    : emptyRuleSet(auctionId);
}
