import {
  evaluateReadiness,
  type Readiness,
  type ReadinessInput,
  type ReadinessTeam,
} from "@/domain/readiness";
import { resolveStartingPrice } from "@/domain/rules";
import { isEditableAuction } from "@/server/auction-query/editable";
import { loadRuleSet } from "@/server/auction-query/rules";
import { mapTeamRow, type TeamRow } from "@/server/auction-query/teams";
import type { Queryable } from "@/server/database/queryable";

interface PlayerSupplyRow {
  is_representative: boolean;
  starting_price_override: null | number;
  team_id: null | string;
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
  const [ruleSet, teamsResult, supplyResult] = await Promise.all([
    loadRuleSet(db, auctionId),
    db.query<TeamRow>(
      `select * from "team"
        where "auction_id" = $1
        order by "position" asc, "created_at" asc, "id" asc`,
      [auctionId],
    ),
    db.query<PlayerSupplyRow>(
      `select "is_representative", "team_id", "starting_price_override"
         from "player_entry"
        where "auction_id" = $1`,
      [auctionId],
    ),
  ]);

  const teams = teamsResult.rows.map(mapTeamRow);
  const preassignedByTeam = new Map<string, number>();
  for (const entry of supplyResult.rows) {
    if (!entry.is_representative || !entry.team_id) continue;
    preassignedByTeam.set(
      entry.team_id,
      (preassignedByTeam.get(entry.team_id) ?? 0) + 1,
    );
  }

  const readinessTeams: ReadinessTeam[] = teams.map((team) => ({
    id: team.id,
    name: team.name,
    preassignedCount: preassignedByTeam.get(team.id) ?? 0,
    representativeUserId: team.representativeUserId,
  }));

  const defaultStartingPrice = ruleSet.defaultStartingPrice ?? 0;
  const players = supplyResult.rows
    .filter((entry) => !entry.is_representative)
    .map((entry) => ({
      startingPrice: resolveStartingPrice(
        entry.starting_price_override,
        defaultStartingPrice,
      ),
    }));

  const disconnectedRepresentativeUserIds =
    await loadDisconnectedRepresentatives(db, [
      ...new Set(
        teams.flatMap((team) =>
          team.representativeUserId ? [team.representativeUserId] : [],
        ),
      ),
    ]);

  return {
    auctionId,
    disconnectedRepresentativeUserIds,
    players,
    ruleSet,
    teams: readinessTeams,
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
