import type { PoolClient } from "pg";

import type { RulesMode } from "@/domain/auction";
import { evaluateLegalCompletion } from "@/domain/legal-completion";
import { resolveOfferedStartingPrice } from "@/domain/rules";
import { evaluateTieredCompletion } from "@/domain/tiered-completion";
import { loadTeamMinimumStates } from "@/server/auction-query/progress";

interface RulesRow {
  budget: null | number;
  default_starting_price: null | number;
  roster_max: null | number;
  roster_min: null | number;
}

interface TierRow {
  id: string;
  label: string;
  max_per_team: number;
  min_per_team: number;
  position: number;
  starting_price: number;
}

interface SupplyRow {
  id: string;
  starting_price_override: null | number;
  tier_id: null | string;
}

interface FeasibilityTeam {
  budget: number;
  id: string;
  preassignedByTier: number[];
  preassignedTotal: number;
  spent: number;
}

interface Feasibility {
  defaultStartingPrice: number;
  rosterMax: number;
  rosterMin: number;
  supply: { id: string; startingPrice: number; tierId: null | string }[];
  teams: FeasibilityTeam[];
  tiers: TierRow[];
}

/**
 * The locked snapshot every Legal Completion check shares: complete Rules, the
 * ordered Tiers, each Team's committed spend and current Roster, and the
 * Players that can still be allocated.
 *
 * "Still available" excludes a Player who already has an accepted Sale and a
 * Player whose Unsold Pool membership is resolved (assigned by a Forced
 * Assignment or marked Final Unsold). Those Players can no longer be offered,
 * so counting them as supply would claim a completion that cannot happen.
 */
async function loadFeasibility(
  client: PoolClient,
  auctionId: string,
): Promise<Feasibility | null> {
  const rulesResult = await client.query<RulesRow>(
    `select "budget", "default_starting_price", "roster_min", "roster_max"
       from "auction_rule_set" where "auction_id" = $1`,
    [auctionId],
  );
  const rules = rulesResult.rows[0];
  if (
    !rules ||
    rules.budget === null ||
    rules.roster_min === null ||
    rules.roster_max === null
  ) {
    return null;
  }

  const tiersResult = await client.query<TierRow>(
    `select "id", "label", "position", "starting_price", "min_per_team",
            "max_per_team"
       from "tier" where "auction_id" = $1 order by "position" asc`,
    [auctionId],
  );
  const tiers = tiersResult.rows;

  // The same Roster read model the live snapshot and the unsold-resolution
  // commands use, so a Team's Roster can never mean two different things.
  const rosterStates = await loadTeamMinimumStates(
    client,
    auctionId,
    tiers.map((tier) => tier.id),
  );

  const supplyResult = await client.query<SupplyRow>(
    `select pe."id", pe."tier_id", pe."starting_price_override"
       from "player_entry" pe
      where pe."auction_id" = $1
        and not pe."is_representative"
        and not exists (
          select 1 from "sale" s
           where s."player_entry_id" = pe."id" and s."reversed_at" is null)
        and not exists (
          select 1 from "unsold_membership" um
           where um."player_entry_id" = pe."id" and um."resolved_at" is not null)`,
    [auctionId],
  );

  const tierIndexById = new Map(tiers.map((tier, index) => [tier.id, index]));
  const defaultStartingPrice = rules.default_starting_price ?? 0;

  const teams: FeasibilityTeam[] = rosterStates.map((team) => ({
    budget: rules.budget!,
    id: team.id,
    preassignedByTier: team.tierCounts,
    preassignedTotal: team.rosterCount,
    spent: team.spentCredits,
  }));

  const supply = supplyResult.rows.map((row) => ({
    id: row.id,
    startingPrice: resolveOfferedStartingPrice({
      defaultStartingPrice,
      startingPriceOverride: row.starting_price_override,
      tierStartingPrice: row.tier_id
        ? (tiers[tierIndexById.get(row.tier_id) ?? -1]?.starting_price ?? null)
        : null,
    }),
    tierId: row.tier_id,
  }));

  return {
    defaultStartingPrice,
    rosterMax: rules.roster_max,
    rosterMin: rules.roster_min,
    supply,
    teams,
    tiers,
  };
}

/**
 * The Tiered counterpart of the shared engine: the same allocation problem,
 * limited to the Players that belong to a real Tier.
 */
function runTieredEngine(
  feasibility: Feasibility,
  teams: readonly {
    budget: number;
    preassignedByTier: readonly number[];
    preassignedTotal: number;
    spent: number;
  }[],
): boolean {
  const { supply, tiers } = feasibility;
  const tierIndexById = new Map(tiers.map((tier, index) => [tier.id, index]));

  return evaluateTieredCompletion({
    players: supply
      .filter((player) => player.tierId && tierIndexById.has(player.tierId))
      .map((player) => ({
        startingPrice: player.startingPrice,
        tierIndex: tierIndexById.get(player.tierId!)!,
      })),
    rosterMax: feasibility.rosterMax,
    rosterMin: feasibility.rosterMin,
    teams,
    tiers: tiers.map((tier) => ({
      label: tier.label,
      maxPerTeam: tier.max_per_team,
      minPerTeam: tier.min_per_team,
    })),
  }).possible;
}

/**
 * Answers whether the Auction, as currently committed, still has a Legal
 * Completion. Corrections use it to refuse a change that would make a legal
 * finish impossible for some Team.
 */
export async function auctionKeepsLegalCompletion(
  client: PoolClient,
  {
    auctionId,
    rulesMode,
  }: {
    auctionId: string;
    rulesMode: RulesMode;
  },
): Promise<boolean> {
  const feasibility = await loadFeasibility(client, auctionId);
  // An Auction cannot be Live without complete Rules.
  if (!feasibility) return false;

  if (rulesMode === "tiered") {
    return runTieredEngine(
      feasibility,
      feasibility.teams.map((team) => ({
        budget: team.budget,
        preassignedByTier: team.preassignedByTier,
        preassignedTotal: team.preassignedTotal,
        spent: team.spent,
      })),
    );
  }

  return evaluateLegalCompletion({
    players: feasibility.supply.map((player) => ({
      startingPrice: player.startingPrice,
    })),
    rosterMax: feasibility.rosterMax,
    rosterMin: feasibility.rosterMin,
    teams: feasibility.teams.map((team) => ({
      budget: team.budget,
      preassignedCount: team.preassignedTotal,
      spent: team.spent,
    })),
  }).possible;
}

/**
 * Answers whether a hypothetical winning Bid still leaves every Team a Legal
 * Completion. The engine is shared with Readiness, so the two can never
 * disagree. The Bid's Player joins the bidding Team's Roster and is removed
 * from the remaining supply before the check.
 */
export async function bidKeepsLegalCompletion(
  client: PoolClient,
  {
    amount,
    auctionId,
    excludePlayerEntryId,
    playerTierId,
    rulesMode,
    teamId,
  }: {
    amount: number;
    auctionId: string;
    excludePlayerEntryId: string;
    playerTierId: null | string;
    rulesMode: RulesMode;
    teamId: string;
  },
): Promise<boolean> {
  const feasibility = await loadFeasibility(client, auctionId);
  if (!feasibility) return false;

  const { supply, tiers } = feasibility;
  const tierIndexById = new Map(tiers.map((tier, index) => [tier.id, index]));
  const remaining = supply.filter((row) => row.id !== excludePlayerEntryId);

  if (rulesMode !== "tiered") {
    return evaluateLegalCompletion({
      players: remaining.map((row) => ({ startingPrice: row.startingPrice })),
      rosterMax: feasibility.rosterMax,
      rosterMin: feasibility.rosterMin,
      teams: feasibility.teams.map((team) => {
        const isBidding = team.id === teamId;
        return {
          budget: team.budget,
          preassignedCount: team.preassignedTotal + (isBidding ? 1 : 0),
          spent: team.spent + (isBidding ? amount : 0),
        };
      }),
    }).possible;
  }

  const playerTierIndex = playerTierId
    ? tierIndexById.get(playerTierId)
    : undefined;
  return runTieredEngine(
    { ...feasibility, supply: remaining },
    feasibility.teams.map((team) => {
      const isBidding = team.id === teamId;
      return {
        budget: team.budget,
        preassignedByTier: team.preassignedByTier.map((count, index) =>
          isBidding && index === playerTierIndex ? count + 1 : count,
        ),
        preassignedTotal: team.preassignedTotal + (isBidding ? 1 : 0),
        spent: team.spent + (isBidding ? amount : 0),
      };
    }),
  );
}
