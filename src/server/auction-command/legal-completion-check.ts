import type { PoolClient } from "pg";

import type { RulesMode } from "@/domain/auction";
import {
  evaluateLegalCompletion,
  type CompletionTeam,
} from "@/domain/legal-completion";
import { resolveOfferedStartingPrice } from "@/domain/rules";
import { evaluateTieredCompletion } from "@/domain/tiered-completion";

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

interface TeamSpendRow {
  id: string;
  spent: number;
}

interface RepCountRow {
  count: number;
  team_id: string;
  tier_id: null | string;
}

interface SupplyRow {
  id: string;
  starting_price_override: null | number;
  tier_id: null | string;
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
    // An Auction cannot be Live without complete Rules.
    return false;
  }

  const tiersResult = await client.query<TierRow>(
    `select "id", "label", "position", "starting_price", "min_per_team",
            "max_per_team"
       from "tier" where "auction_id" = $1 order by "position" asc`,
    [auctionId],
  );
  const tiers = tiersResult.rows;

  const spendResult = await client.query<TeamSpendRow>(
    `select t."id",
            coalesce(sum(s."amount") filter (where s."reversed_at" is null), 0)::int as spent
       from "team" t
       left join "sale" s on s."team_id" = t."id"
      where t."auction_id" = $1
      group by t."id"`,
    [auctionId],
  );

  const repResult = await client.query<RepCountRow>(
    `select "team_id", "tier_id", count(*)::int as count
       from "player_entry"
      where "auction_id" = $1 and "team_id" is not null and "is_representative"
      group by "team_id", "tier_id"`,
    [auctionId],
  );
  const repByTeam = new Map<
    string,
    { total: number; byTier: Map<string, number> }
  >();
  for (const row of repResult.rows) {
    const entry = repByTeam.get(row.team_id) ?? { byTier: new Map(), total: 0 };
    entry.total += row.count;
    if (row.tier_id) {
      entry.byTier.set(
        row.tier_id,
        (entry.byTier.get(row.tier_id) ?? 0) + row.count,
      );
    }
    repByTeam.set(row.team_id, entry);
  }

  const supplyResult = await client.query<SupplyRow>(
    `select pe."id", pe."tier_id", pe."starting_price_override"
       from "player_entry" pe
      where pe."auction_id" = $1
        and not pe."is_representative"
        and pe."id" <> $2
        and not exists (
          select 1 from "sale" s
           where s."player_entry_id" = pe."id" and s."reversed_at" is null)`,
    [auctionId, excludePlayerEntryId],
  );

  const tierIndexById = new Map(tiers.map((tier, index) => [tier.id, index]));
  const defaultStartingPrice = rules.default_starting_price ?? 0;

  const teams: CompletionTeam[] = spendResult.rows.map((team) => {
    const reps = repByTeam.get(team.id);
    const isBidding = team.id === teamId;
    return {
      budget: rules.budget!,
      preassignedCount: (reps?.total ?? 0) + (isBidding ? 1 : 0),
      spent: team.spent + (isBidding ? amount : 0),
    };
  });

  if (rulesMode !== "tiered") {
    const completion = evaluateLegalCompletion({
      players: supplyResult.rows.map((row) => ({
        startingPrice: row.starting_price_override ?? defaultStartingPrice,
      })),
      rosterMax: rules.roster_max!,
      rosterMin: rules.roster_min!,
      teams,
    });
    return completion.possible;
  }

  const tieredTeams = spendResult.rows.map((team) => {
    const reps = repByTeam.get(team.id);
    const isBidding = team.id === teamId;
    return {
      budget: rules.budget!,
      preassignedByTier: tiers.map((tier) => {
        const base = reps?.byTier.get(tier.id) ?? 0;
        return base + (isBidding && tier.id === playerTierId ? 1 : 0);
      }),
      spent: team.spent + (isBidding ? amount : 0),
    };
  });

  const completion = evaluateTieredCompletion({
    players: supplyResult.rows
      .filter((row) => row.tier_id && tierIndexById.has(row.tier_id))
      .map((row) => ({
        startingPrice: resolveOfferedStartingPrice({
          defaultStartingPrice,
          startingPriceOverride: row.starting_price_override,
          tierStartingPrice:
            tiers[tierIndexById.get(row.tier_id!)!]!.starting_price,
        }),
        tierIndex: tierIndexById.get(row.tier_id!)!,
      })),
    rosterMax: rules.roster_max!,
    rosterMin: rules.roster_min!,
    teams: tieredTeams,
    tiers: tiers.map((tier) => ({
      label: tier.label,
      maxPerTeam: tier.max_per_team,
      minPerTeam: tier.min_per_team,
    })),
  });

  return completion.possible;
}
