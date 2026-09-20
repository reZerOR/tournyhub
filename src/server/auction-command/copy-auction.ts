import type { Pool } from "pg";

import {
  copyAuctionInputSchema,
  type CopyAuctionInput,
} from "@/domain/lifecycle";
import { isUniqueViolation } from "@/server/database/pg-error";

/** A copy that failed for a reason the Organizer can act on. */
export class CopyAuctionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopyAuctionError";
  }
}

export interface CopyAuctionResult {
  auctionId: string;
  copiedPlayerCount: number;
}

/**
 * Copies an earlier Auction the Organizer owns into a separate Draft. Rules,
 * Custom Player Field definitions, and the selected Player Entries come across;
 * Teams, representatives, invitations, Bids, Sales, Forced Assignments,
 * Results, and Audit history never do, so the new Draft carries no stale
 * authority or outcome.
 *
 * The Tier and Starting Price choice is the Organizer's: with
 * `keepTierAndPrice` the Tiers, each Player's Tier, and Starting Price overrides
 * are copied; without it the new Auction starts with no Tiers and no price
 * data, so they are assigned again.
 *
 * Returns null when the source does not exist, is Archived, or belongs to
 * another Organizer, so callers cannot copy someone else's Auction by guessing
 * an id.
 */
export async function copyAuction(
  pool: Pool,
  actorUserId: string,
  input: CopyAuctionInput,
): Promise<CopyAuctionResult | null> {
  const parsed = copyAuctionInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");

    // `for share` holds the source still while it is read, so a copy never
    // mixes two versions of the same Auction.
    const source = await client.query<{
      close_mode: string;
      game: string;
      rules_mode: string;
      status: string;
    }>(
      `select "game", "rules_mode", "close_mode", "status" from "auction"
        where "id" = $1 and "organizer_id" = $2 for share`,
      [parsed.sourceAuctionId, actorUserId],
    );
    const sourceAuction = source.rows[0];
    if (!sourceAuction || sourceAuction.status === "archived") {
      await client.query("rollback");
      return null;
    }

    const created = await client.query<{ id: string }>(
      `insert into "auction"
          ("organizer_id", "title", "game", "rules_mode", "close_mode", "status")
       values ($1, $2, $3, $4, $5, 'draft')
       returning "id"`,
      [
        actorUserId,
        parsed.title,
        sourceAuction.game,
        sourceAuction.rules_mode,
        sourceAuction.close_mode,
      ],
    );
    const newAuctionId = created.rows[0]!.id;

    await client.query(
      `insert into "auction_rule_set"
          ("auction_id", "roster_min", "roster_max", "budget", "bid_increment",
           "default_starting_price", "timed_close_seconds")
       select $2, "roster_min", "roster_max", "budget", "bid_increment",
              "default_starting_price", "timed_close_seconds"
         from "auction_rule_set" where "auction_id" = $1`,
      [parsed.sourceAuctionId, newAuctionId],
    );

    const fieldMap = new Map<string, string>();
    const fields = await client.query<{ id: string; label: string }>(
      `select "id", "label" from "custom_player_field"
        where "auction_id" = $1 order by "created_at" asc, "id" asc`,
      [parsed.sourceAuctionId],
    );
    for (const field of fields.rows) {
      const inserted = await client.query<{ id: string }>(
        `insert into "custom_player_field" ("auction_id", "label")
         values ($1, $2) returning "id"`,
        [newAuctionId, field.label],
      );
      fieldMap.set(field.id, inserted.rows[0]!.id);
    }

    const tierIdMap = new Map<string, string>();
    if (parsed.keepTierAndPrice) {
      const tiers = await client.query<{
        id: string;
        label: string;
        max_per_team: number;
        min_per_team: number;
        normalized_label: string;
        position: number;
        starting_price: number;
      }>(
        `select "id", "label", "normalized_label", "position", "starting_price",
                "min_per_team", "max_per_team"
           from "tier" where "auction_id" = $1
          order by "position" asc, "created_at" asc, "id" asc`,
        [parsed.sourceAuctionId],
      );
      for (const tier of tiers.rows) {
        const inserted = await client.query<{ id: string }>(
          `insert into "tier"
              ("auction_id", "label", "normalized_label", "position",
               "starting_price", "min_per_team", "max_per_team")
           values ($1, $2, $3, $4, $5, $6, $7)
           returning "id"`,
          [
            newAuctionId,
            tier.label,
            tier.normalized_label,
            tier.position,
            tier.starting_price,
            tier.min_per_team,
            tier.max_per_team,
          ],
        );
        tierIdMap.set(tier.id, inserted.rows[0]!.id);
      }
    }

    if (parsed.playerEntryIds.length === 0) {
      await client.query("commit");
      return { auctionId: newAuctionId, copiedPlayerCount: 0 };
    }

    const entries = await client.query<{
      display_name: string;
      external_player_id: null | string;
      id: string;
      phone_number: null | string;
      role: null | string;
      starting_price_override: null | number;
      tier_id: null | string;
    }>(
      `select "id", "display_name", "role", "external_player_id",
              "phone_number", "tier_id", "starting_price_override"
         from "player_entry"
        where "auction_id" = $1 and "id" = any($2::uuid[])
        order by "created_at" asc, "id" asc`,
      [parsed.sourceAuctionId, parsed.playerEntryIds],
    );

    for (const entry of entries.rows) {
      const inserted = await client.query<{ id: string }>(
        `insert into "player_entry"
            ("auction_id", "display_name", "role", "external_player_id",
             "phone_number", "tier_id", "starting_price_override")
         values ($1, $2, $3, $4, $5, $6, $7)
         returning "id"`,
        [
          newAuctionId,
          entry.display_name,
          entry.role,
          entry.external_player_id,
          entry.phone_number,
          parsed.keepTierAndPrice && entry.tier_id
            ? (tierIdMap.get(entry.tier_id) ?? null)
            : null,
          parsed.keepTierAndPrice ? entry.starting_price_override : null,
        ],
      );
      const newEntryId = inserted.rows[0]!.id;

      const values = await client.query<{
        custom_player_field_id: string;
        value: string;
      }>(
        `select "custom_player_field_id", "value"
           from "player_entry_custom_value" where "player_entry_id" = $1`,
        [entry.id],
      );
      for (const value of values.rows) {
        const mappedFieldId = fieldMap.get(value.custom_player_field_id);
        if (!mappedFieldId) continue;
        await client.query(
          `insert into "player_entry_custom_value"
              ("player_entry_id", "custom_player_field_id", "value")
           values ($1, $2, $3)`,
          [newEntryId, mappedFieldId, value.value],
        );
      }
    }

    await client.query("commit");
    return { auctionId: newAuctionId, copiedPlayerCount: entries.rows.length };
  } catch (error) {
    await client.query("rollback");
    if (isUniqueViolation(error)) {
      throw new CopyAuctionError(
        "The copied Player Entries conflict with each other. Copy them again without the duplicates.",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}
