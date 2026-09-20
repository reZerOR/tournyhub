import type { Queryable } from "@/server/database/queryable";

/**
 * The read model the final Results revision publishes. It mirrors the
 * authorized Results view rather than the live console, so a Completed Auction
 * has one authoritative record of what every Team acquired.
 */
export interface AuctionResultsTeam {
  id: string;
  name: null | string;
  players: {
    amount: number;
    displayName: string;
    playerEntryId: string;
    source: "bid" | "forced";
    tierId: null | string;
  }[];
  remainingBudget: number;
  rosterCount: number;
  spentCredits: number;
  tierCounts: Record<string, number>;
}

export interface AuctionResults {
  teams: AuctionResultsTeam[];
  unsold: {
    displayName: string;
    playerEntryId: string;
    resolution: "final_unsold" | "open";
  }[];
}

export async function loadAuctionResults(
  db: Queryable,
  auctionId: string,
): Promise<AuctionResults> {
  const teamsResult = await db.query<{
    id: string;
    name: null | string;
    position: number;
  }>(
    `select "id", "name", "position" from "team"
      where "auction_id" = $1
      order by "position" asc, "created_at" asc, "id" asc`,
    [auctionId],
  );

  const budgetResult = await db.query<{ budget: null | number }>(
    `select "budget" from "auction_rule_set" where "auction_id" = $1`,
    [auctionId],
  );
  const budget = budgetResult.rows[0]?.budget ?? 0;

  const salesResult = await db.query<{
    amount: number;
    display_name: string;
    player_entry_id: string;
    source: "bid" | "forced";
    team_id: string;
    tier_id: null | string;
  }>(
    `select s."amount", s."source", s."team_id", s."player_entry_id",
            pe."display_name", pe."tier_id"
       from "sale" s
       join "player_entry" pe on pe."id" = s."player_entry_id"
      where s."auction_id" = $1 and s."reversed_at" is null
      order by s."created_at" asc, s."id" asc`,
    [auctionId],
  );

  const repsResult = await db.query<{
    team_id: string;
    tier_id: null | string;
  }>(
    `select "team_id", "tier_id" from "player_entry"
      where "auction_id" = $1 and "team_id" is not null and "is_representative"`,
    [auctionId],
  );

  const unsoldResult = await db.query<{
    display_name: string;
    player_entry_id: string;
    resolution: null | string;
  }>(
    `select um."player_entry_id", pe."display_name", um."resolution"
       from "unsold_membership" um
       join "player_entry" pe on pe."id" = um."player_entry_id"
      where um."auction_id" = $1
        and (um."resolution" is null or um."resolution" = 'final_unsold')
      order by pe."created_at" asc, pe."id" asc`,
    [auctionId],
  );

  const byTeam = new Map<string, AuctionResultsTeam>();
  for (const team of teamsResult.rows) {
    byTeam.set(team.id, {
      id: team.id,
      name: team.name,
      players: [],
      remainingBudget: budget,
      rosterCount: 0,
      spentCredits: 0,
      tierCounts: {},
    });
  }

  const addTo = (teamId: string, tierId: null | string, count: number) => {
    const team = byTeam.get(teamId);
    if (!team) return;
    team.rosterCount += count;
    const key = tierId ?? "unassigned";
    team.tierCounts[key] = (team.tierCounts[key] ?? 0) + count;
  };

  for (const rep of repsResult.rows) {
    addTo(rep.team_id, rep.tier_id, 1);
  }

  for (const sale of salesResult.rows) {
    const team = byTeam.get(sale.team_id);
    if (!team) continue;
    addTo(sale.team_id, sale.tier_id, 1);
    team.spentCredits += sale.amount;
    team.remainingBudget = budget - team.spentCredits;
    team.players.push({
      amount: sale.amount,
      displayName: sale.display_name,
      playerEntryId: sale.player_entry_id,
      source: sale.source,
      tierId: sale.tier_id,
    });
  }

  return {
    teams: teamsResult.rows.map((team) => byTeam.get(team.id)!),
    unsold: unsoldResult.rows.map((row) => ({
      displayName: row.display_name,
      playerEntryId: row.player_entry_id,
      resolution: row.resolution === "final_unsold" ? "final_unsold" : "open",
    })),
  };
}
