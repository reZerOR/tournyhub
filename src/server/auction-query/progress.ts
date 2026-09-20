import { resolveOfferedStartingPrice } from "@/domain/rules";
import type { Queryable } from "@/server/database/queryable";

/**
 * Read models the live lifecycle, Tier progression, and unsold resolution all
 * share. Commands read them on their locked transaction so the counts they
 * report and the decisions made from them come from one consistent snapshot.
 */

export interface TeamMinimumState {
  id: string;
  /** Every Player on the Roster: Player Representatives and accepted Sales. */
  rosterCount: number;
  /** Credits this Team has committed to accepted Sales. */
  spentCredits: number;
  /** The Roster count per Tier, indexed like the ordered Tier list. */
  tierCounts: number[];
}

/** Each Team's current Roster size, committed spend, and per-Tier counts. */
export async function loadTeamMinimumStates(
  db: Queryable,
  auctionId: string,
  orderedTierIds: readonly string[],
): Promise<TeamMinimumState[]> {
  const result = await db.query<{
    team_id: string;
    tier_id: null | string;
    count: number;
  }>(
    `select pe."team_id", pe."tier_id", count(*)::int as count
       from "player_entry" pe
      where pe."auction_id" = $1 and pe."team_id" is not null
        and pe."is_representative"
      group by pe."team_id", pe."tier_id"
     union all
     select s."team_id", pe."tier_id", count(*)::int as count
       from "sale" s
       join "player_entry" pe on pe."id" = s."player_entry_id"
      where s."auction_id" = $1 and s."reversed_at" is null
      group by s."team_id", pe."tier_id"`,
    [auctionId],
  );

  const spendResult = await db.query<{ id: string; spent: number }>(
    `select t."id",
            coalesce(sum(s."amount") filter (where s."reversed_at" is null), 0)::int as spent
       from "team" t
       left join "sale" s on s."team_id" = t."id"
      where t."auction_id" = $1
      group by t."id"`,
    [auctionId],
  );

  const teams = await db.query<{ id: string }>(
    `select "id" from "team"
      where "auction_id" = $1
      order by "position" asc, "created_at" asc, "id" asc`,
    [auctionId],
  );

  const tierIndexById = new Map(
    orderedTierIds.map((tierId, index) => [tierId, index]),
  );
  const spentById = new Map(spendResult.rows.map((row) => [row.id, row.spent]));
  const byTeam = new Map<string, TeamMinimumState>();
  for (const row of teams.rows) {
    byTeam.set(row.id, {
      id: row.id,
      rosterCount: 0,
      spentCredits: spentById.get(row.id) ?? 0,
      tierCounts: orderedTierIds.map(() => 0),
    });
  }
  for (const row of result.rows) {
    const team = byTeam.get(row.team_id);
    if (!team) continue;
    team.rosterCount += row.count;
    const tierIndex = row.tier_id ? tierIndexById.get(row.tier_id) : undefined;
    if (tierIndex !== undefined) {
      team.tierCounts[tierIndex] =
        (team.tierCounts[tierIndex] ?? 0) + row.count;
    }
  }

  return teams.rows.map((row) => byTeam.get(row.id)!);
}

export interface TierProgressState {
  biddableCount: number;
  id: string;
  label: string;
  offeredCount: number;
  position: number;
}

/**
 * How far each Tier has progressed. A Player counts as offered once it has a
 * completed Presentation: a Sale or an Unsold result. A returned Presentation
 * does not count, because that Player is back in the offering queue.
 */
export async function loadTierProgress(
  db: Queryable,
  auctionId: string,
): Promise<TierProgressState[]> {
  const result = await db.query<TierProgressState>(
    `select t."id",
            t."label",
            t."position",
            count(pe."id")::int as "biddableCount",
            count(pe."id") filter (where exists (
              select 1 from "player_presentation" pp
               where pp."player_entry_id" = pe."id"
                 and pp."state" in ('sold', 'unsold')))::int as "offeredCount"
       from "tier" t
       left join "player_entry" pe
         on pe."tier_id" = t."id" and not pe."is_representative"
      where t."auction_id" = $1
      group by t."id", t."label", t."position"
      order by t."position" asc`,
    [auctionId],
  );
  return result.rows;
}

/**
 * The Tiers that have been opened: a Player in them has been presented at
 * least once, whatever the Presentation's current state. Once a Tier is opened
 * its Player pool is stable, so no Player may be added to it after the Auction
 * starts.
 */
export async function loadOpenedTierIds(
  db: Queryable,
  auctionId: string,
): Promise<Set<string>> {
  const result = await db.query<{ tier_id: string }>(
    `select distinct "tier_id" from "player_presentation"
      where "auction_id" = $1 and "tier_id" is not null`,
    [auctionId],
  );
  return new Set(result.rows.map((row) => row.tier_id));
}

/**
 * The biddable Players that have not been completed at all: no Sale, no Unsold
 * result, and no currently Active Presentation. Simple Rules use this as their
 * whole offering queue.
 */
export async function countUnresolvedBiddablePlayers(
  db: Queryable,
  auctionId: string,
): Promise<number> {
  const result = await db.query<{ count: number }>(
    `select count(*)::int as count
       from "player_entry" pe
      where pe."auction_id" = $1 and not pe."is_representative"
        and not exists (
          select 1 from "player_presentation" pp
           where pp."player_entry_id" = pe."id"
             and pp."state" in ('open', 'closing', 'sold', 'unsold'))
        and not exists (
          select 1 from "sale" s
           where s."player_entry_id" = pe."id" and s."reversed_at" is null)`,
    [auctionId],
  );
  return result.rows[0]?.count ?? 0;
}

export interface UnsoldPoolEntry {
  displayName: string;
  playerEntryId: string;
  startingPrice: number;
  tierId: null | string;
}

/**
 * The unresolved Unsold Pool. A Player keeps the Starting Price frozen when it
 * was first offered, so a reoffer cannot change the price.
 */
export async function loadUnsoldPool(
  db: Queryable,
  auctionId: string,
  defaultStartingPrice: number,
): Promise<UnsoldPoolEntry[]> {
  const result = await db.query<{
    display_name: string;
    player_entry_id: string;
    starting_price: null | number;
    starting_price_override: null | number;
    tier_id: null | string;
    tier_starting_price: null | number;
  }>(
    `select um."player_entry_id",
            pe."display_name",
            pe."tier_id",
            pe."starting_price_override",
            t."starting_price" as tier_starting_price,
            first_presentation."starting_price"
       from "unsold_membership" um
       join "player_entry" pe on pe."id" = um."player_entry_id"
       left join "tier" t on t."id" = pe."tier_id"
       left join lateral (
         select pp."starting_price" from "player_presentation" pp
          where pp."player_entry_id" = pe."id"
          order by pp."opened_at" asc, pp."created_at" asc
          limit 1
       ) first_presentation on true
      where um."auction_id" = $1 and um."resolved_at" is null
      order by pe."created_at" asc, pe."id" asc`,
    [auctionId],
  );

  return result.rows.map((row) => ({
    displayName: row.display_name,
    playerEntryId: row.player_entry_id,
    startingPrice:
      row.starting_price ??
      resolveOfferedStartingPrice({
        defaultStartingPrice,
        startingPriceOverride: row.starting_price_override,
        tierStartingPrice: row.tier_starting_price,
      }),
    tierId: row.tier_id,
  }));
}

export interface UnsoldRoundState {
  id: string;
  sequence: number;
}

/** The one open Unsold Round, or null when none is open. */
export async function loadOpenUnsoldRound(
  db: Queryable,
  auctionId: string,
): Promise<null | UnsoldRoundState> {
  const result = await db.query<UnsoldRoundState>(
    `select "id", "sequence" from "unsold_round"
      where "auction_id" = $1 and "status" = 'open'`,
    [auctionId],
  );
  return result.rows[0] ?? null;
}

/**
 * The Players already completed during one Unsold Round. Only a Sale or Unsold
 * result counts, so a returned Player can be offered again in the same round.
 */
export async function loadRoundOfferedPlayerIds(
  db: Queryable,
  roundId: string,
): Promise<Set<string>> {
  const result = await db.query<{ player_entry_id: string }>(
    `select distinct "player_entry_id" from "player_presentation"
      where "unsold_round_id" = $1 and "state" in ('sold', 'unsold')`,
    [roundId],
  );
  return new Set(result.rows.map((row) => row.player_entry_id));
}

export interface OpenSale {
  amount: number;
  playerDisplayName: string;
  playerEntryId: string;
  saleId: string;
  source: "bid" | "forced";
  teamId: string;
}

/** Every committed Sale the Organizer may still reverse. */
export async function loadOpenSales(
  db: Queryable,
  auctionId: string,
): Promise<OpenSale[]> {
  const result = await db.query<{
    amount: number;
    display_name: string;
    id: string;
    player_entry_id: string;
    source: "bid" | "forced";
    team_id: string;
  }>(
    `select s."id", s."amount", s."source", s."team_id", s."player_entry_id",
            pe."display_name"
       from "sale" s
       join "player_entry" pe on pe."id" = s."player_entry_id"
      where s."auction_id" = $1 and s."reversed_at" is null
      order by s."created_at" asc, s."id" asc`,
    [auctionId],
  );
  return result.rows.map((row) => ({
    amount: row.amount,
    playerDisplayName: row.display_name,
    playerEntryId: row.player_entry_id,
    saleId: row.id,
    source: row.source,
    teamId: row.team_id,
  }));
}
