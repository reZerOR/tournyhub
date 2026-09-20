import type { Pool, PoolClient } from "pg";

import {
  normalizeTierLabel,
  tierInputSchema,
  TIER_LIMITS,
  tierOrderSchema,
  type Tier,
  type TierInput,
  type TierOrderInput,
} from "@/domain/tier";
import {
  lockEditableAuction,
  markAuctionDraft,
} from "@/server/auction-command/lock-editable-auction";
import { isUniqueViolation } from "@/server/database/pg-error";
import {
  loadTierRow,
  loadTiers,
  mapTierRow,
  type TierRow,
} from "@/server/auction-query/tiers";

/** A Tier rule the Organizer can repair, as opposed to an unexpected failure. */
export class TierSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TierSetupError";
  }
}

async function assertTierCapacity(
  client: PoolClient,
  auctionId: string,
): Promise<void> {
  const result = await client.query<{ count: number }>(
    `select count(*)::int as count from "tier" where "auction_id" = $1`,
    [auctionId],
  );
  if (result.rows[0]!.count >= TIER_LIMITS.maxTiers) {
    throw new TierSetupError(
      `An Auction can hold at most ${TIER_LIMITS.maxTiers} Tiers.`,
    );
  }
}

async function assertLabelFree(
  client: PoolClient,
  auctionId: string,
  label: string,
  exceptTierId?: string,
): Promise<void> {
  const result = await client.query(
    `select "id" from "tier"
      where "auction_id" = $1 and "normalized_label" = $2
        and ($3::uuid is null or "id" <> $3)`,
    [auctionId, normalizeTierLabel(label), exceptTierId ?? null],
  );
  if (result.rowCount && result.rowCount > 0) {
    throw new TierSetupError("Another Tier already uses that name.");
  }
}

async function nextTierPosition(
  client: PoolClient,
  auctionId: string,
): Promise<number> {
  const result = await client.query<{ next: number }>(
    `select coalesce(max("position"), -1) + 1 as next from "tier" where "auction_id" = $1`,
    [auctionId],
  );
  return result.rows[0]!.next;
}

/** Adds an ordered Tier. Returns null when the Auction is not editable by this Organizer. */
export async function createTier(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  input: TierInput,
): Promise<null | Tier> {
  const parsed = tierInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }

    await assertTierCapacity(client, auctionId);
    await assertLabelFree(client, auctionId, parsed.label);
    const position = await nextTierPosition(client, auctionId);

    const inserted = await client.query<TierRow>(
      `insert into "tier"
          ("auction_id", "label", "normalized_label", "position",
           "starting_price", "min_per_team", "max_per_team")
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [
        auctionId,
        parsed.label,
        normalizeTierLabel(parsed.label),
        position,
        parsed.startingPrice,
        parsed.minPerTeam,
        parsed.maxPerTeam,
      ],
    );
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return mapTierRow(inserted.rows[0]!);
  } catch (error) {
    await client.query("rollback");
    if (isUniqueViolation(error)) {
      throw new TierSetupError("Another Tier already uses that name.");
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Renames or reconfigures a Tier. Returns null when it is not editable by this Organizer. */
export async function updateTier(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  tierId: string,
  input: TierInput,
): Promise<null | Tier> {
  const parsed = tierInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }
    if (!(await loadTierRow(client, auctionId, tierId))) {
      await client.query("rollback");
      return null;
    }

    await assertLabelFree(client, auctionId, parsed.label, tierId);
    const updated = await client.query<TierRow>(
      `update "tier"
          set "label" = $3,
              "normalized_label" = $4,
              "starting_price" = $5,
              "min_per_team" = $6,
              "max_per_team" = $7,
              "updated_at" = now()
        where "id" = $1 and "auction_id" = $2
        returning *`,
      [
        tierId,
        auctionId,
        parsed.label,
        normalizeTierLabel(parsed.label),
        parsed.startingPrice,
        parsed.minPerTeam,
        parsed.maxPerTeam,
      ],
    );
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return mapTierRow(updated.rows[0]!);
  } catch (error) {
    await client.query("rollback");
    if (isUniqueViolation(error)) {
      throw new TierSetupError("Another Tier already uses that name.");
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Removes a Tier and returns its Players to the unassigned pool. Returns false when it is not editable by this Organizer. */
export async function deleteTier(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  tierId: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return false;
    }

    const deleted = await client.query(
      `delete from "tier" where "id" = $1 and "auction_id" = $2`,
      [tierId, auctionId],
    );
    if (deleted.rowCount !== 1) {
      await client.query("rollback");
      return false;
    }
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Reorders every Tier to the order of `orderedTierIds`. Returns null when it is not editable by this Organizer. */
export async function reorderTiers(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  input: TierOrderInput,
): Promise<null | Tier[]> {
  const parsed = tierOrderSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }

    const existing = await client.query<{ id: string }>(
      `select "id" from "tier" where "auction_id" = $1`,
      [auctionId],
    );
    const known = new Set(existing.rows.map((row) => row.id));
    const requested = new Set(parsed.orderedTierIds);
    if (
      parsed.orderedTierIds.length !== known.size ||
      requested.size !== known.size ||
      parsed.orderedTierIds.some((id) => !known.has(id))
    ) {
      await client.query("rollback");
      return null;
    }

    // Shift every position out of the way so the unique (auction, position)
    // index never observes a collision while the order is rewritten.
    await client.query(
      `update "tier" set "position" = "position" + 1000000
        where "auction_id" = $1`,
      [auctionId],
    );
    for (const [position, id] of parsed.orderedTierIds.entries()) {
      await client.query(
        `update "tier" set "position" = $3, "updated_at" = now()
          where "id" = $1 and "auction_id" = $2`,
        [id, auctionId, position],
      );
    }
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return loadTiers(pool, auctionId);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Assigns a Player Entry to a Tier, or clears it when `tierId` is null. Returns false when it is not editable by this Organizer. */
export async function assignPlayerTier(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  playerEntryId: string,
  tierId: null | string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return false;
    }

    if (tierId !== null && !(await loadTierRow(client, auctionId, tierId))) {
      await client.query("rollback");
      throw new TierSetupError("That Tier is not in this Auction.");
    }

    const updated = await client.query(
      `update "player_entry"
          set "tier_id" = $3, "updated_at" = now()
        where "id" = $1 and "auction_id" = $2`,
      [playerEntryId, auctionId, tierId],
    );
    if (updated.rowCount !== 1) {
      await client.query("rollback");
      return false;
    }
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
