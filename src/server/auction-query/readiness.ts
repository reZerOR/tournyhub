import type { RulesMode } from "@/domain/auction";
import {
  evaluateReadiness,
  type Readiness,
  type ReadinessInput,
  type ReadinessTeam,
  type ReadinessTier,
} from "@/domain/readiness";
import { resolveOfferedStartingPrice } from "@/domain/rules";
import { isEditableAuction } from "@/server/auction-query/editable";
import { loadRuleSet } from "@/server/auction-query/rules";
import { mapTeamRow, type TeamRow } from "@/server/auction-query/teams";
import { loadTiers } from "@/server/auction-query/tiers";
import type { Queryable } from "@/server/database/queryable";

interface PlayerSupplyRow {
  is_representative: boolean;
  starting_price_override: null | number;
  team_id: null | string;
  tier_id: null | string;
}

/**
 * The representative Users who hold no active session. A disconnected
 * representative is a warning at start, never a blocker.
 */
async function loadDisconnectedRepresentatives(
  db: Queryable,
  representativeIds: string[],
): Promise<string[]> {
  if (representativeIds.length === 0) return [];

  const result = await db.query<{ userId: string }>(
    `select distinct "userId" from "session"
      where "userId" = any($1::text[]) and "expiresAt" > now()`,
    [representativeIds],
  );
  const connected = new Set(result.rows.map((row) => row.userId));
  return representativeIds.filter((id) => !connected.has(id));
}

/**
 * Assembles the current setup into the Readiness engine's input. No
 * authorization is applied here; callers must already have confirmed that the
 * actor may read the Auction.
 */
export async function loadReadinessInput(
  db: Queryable,
  auctionId: string,
): Promise<ReadinessInput> {
  const [auctionResult, ruleSet, tiers, teamsResult, supplyResult] =
    await Promise.all([
      db.query<{ rules_mode: RulesMode }>(
        `select "rules_mode" from "auction" where "id" = $1`,
        [auctionId],
      ),
      loadRuleSet(db, auctionId),
      loadTiers(db, auctionId),
      db.query<TeamRow>(
        `select * from "team"
          where "auction_id" = $1
          order by "position" asc, "created_at" asc, "id" asc`,
        [auctionId],
      ),
      db.query<PlayerSupplyRow>(
        `select "is_representative", "team_id", "tier_id",
                "starting_price_override"
           from "player_entry"
          where "auction_id" = $1`,
        [auctionId],
      ),
    ]);

  const rulesMode = auctionResult.rows[0]?.rules_mode ?? "simple";
  const defaultStartingPrice = ruleSet.defaultStartingPrice ?? 0;
  const tierStartingPrice = new Map(
    tiers.map((tier) => [tier.id, tier.startingPrice]),
  );

  const teams = teamsResult.rows.map(mapTeamRow);
  const preassignedByTeam = new Map<string, number>();
  const preassignedByTeamTier = new Map<string, Record<string, number>>();
  for (const entry of supplyResult.rows) {
    if (!entry.is_representative || !entry.team_id) continue;
    preassignedByTeam.set(
      entry.team_id,
      (preassignedByTeam.get(entry.team_id) ?? 0) + 1,
    );
    if (entry.tier_id) {
      const byTier = preassignedByTeamTier.get(entry.team_id) ?? {};
      byTier[entry.tier_id] = (byTier[entry.tier_id] ?? 0) + 1;
      preassignedByTeamTier.set(entry.team_id, byTier);
    }
  }

  const readinessTeams: ReadinessTeam[] = teams.map((team) => ({
    id: team.id,
    name: team.name,
    preassignedByTier: preassignedByTeamTier.get(team.id) ?? {},
    preassignedCount: preassignedByTeam.get(team.id) ?? 0,
    representativeUserId: team.representativeUserId,
  }));

  const players = supplyResult.rows
    .filter((entry) => !entry.is_representative)
    .map((entry) => ({
      startingPrice: resolveOfferedStartingPrice({
        defaultStartingPrice,
        startingPriceOverride: entry.starting_price_override,
        tierStartingPrice:
          rulesMode === "tiered" && entry.tier_id
            ? (tierStartingPrice.get(entry.tier_id) ?? null)
            : null,
      }),
      tierId: entry.tier_id,
    }));

  const disconnectedRepresentativeUserIds =
    await loadDisconnectedRepresentatives(db, [
      ...new Set(
        teams.flatMap((team) =>
          team.representativeUserId ? [team.representativeUserId] : [],
        ),
      ),
    ]);

  const readinessTiers: ReadinessTier[] = tiers.map((tier) => ({
    id: tier.id,
    label: tier.label,
    maxPerTeam: tier.maxPerTeam,
    minPerTeam: tier.minPerTeam,
    position: tier.position,
    startingPrice: tier.startingPrice,
  }));

  return {
    auctionId,
    disconnectedRepresentativeUserIds,
    players,
    ruleSet,
    rulesMode,
    teams: readinessTeams,
    tiers: readinessTiers,
  };
}

export interface ReadinessReport {
  readiness: Readiness;
}

/** The current Readiness report, or null when the Auction is not editable for this Organizer. */
export async function getReadinessForOrganizer(
  db: Queryable,
  organizerId: string,
  auctionId: string,
): Promise<null | ReadinessReport> {
  if (!(await isEditableAuction(db, organizerId, auctionId))) return null;

  const input = await loadReadinessInput(db, auctionId);
  return { readiness: evaluateReadiness(input) };
}
