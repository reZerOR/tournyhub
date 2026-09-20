import type { RulesMode } from "@/domain/auction";
import {
  canViewPhoneNumbers,
  resultsPhase,
  type AuctionResultsView,
  type ResultsContactRow,
  type ResultsTeamView,
} from "@/domain/results";
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

export interface ResultsCaller {
  role: "organizer" | "representative";
  teamId: null | string;
}

/**
 * The caller's role in the Auction, or null when they have none. An unrelated
 * User, a missing Auction, and a former Representative all read as null, so the
 * caller cannot confirm that a protected Auction exists.
 */
export async function resolveResultsCaller(
  db: Queryable,
  userId: string,
  auctionId: string,
): Promise<null | ResultsCaller> {
  const result = await db.query<{
    organizer_id: string;
    team_id: null | string;
  }>(
    `select a."organizer_id",
            (select t."id" from "team" t
              where t."auction_id" = a."id" and t."representative_user_id" = $2
              limit 1) as team_id
       from "auction" a where a."id" = $1 and a."hidden_at" is null`,
    [auctionId, userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.organizer_id === userId) {
    return { role: "organizer", teamId: null };
  }
  return row.team_id ? { role: "representative", teamId: row.team_id } : null;
}

/**
 * The authorized Results read model for one caller. Phone numbers are filtered
 * server-side by the shared policy, so an unauthorized number never reaches the
 * browser, a log, or a Realtime payload.
 *
 * Returns null for an unrelated User, for a Draft or Ready Auction, and for a
 * missing Auction.
 */
export async function getResultsForCaller(
  db: Queryable,
  userId: string,
  auctionId: string,
): Promise<null | AuctionResultsView> {
  const auctionResult = await db.query<{
    organizer_id: string;
    rules_mode: RulesMode;
    status: string;
    title: string;
  }>(
    `select "organizer_id", "status", "title", "rules_mode"
       from "auction" where "id" = $1 and "hidden_at" is null`,
    [auctionId],
  );
  const auction = auctionResult.rows[0];
  if (!auction) return null;

  const phase = resultsPhase(auction.status);
  if (phase === "setup") return null;

  const caller = await resolveResultsCaller(db, userId, auctionId);
  if (!caller) return null;

  // Sequential reads keep this usable on a transaction client.
  const tiersResult = await db.query<{ id: string; label: string }>(
    `select "id", "label" from "tier" where "auction_id" = $1
      order by "position" asc`,
    [auctionId],
  );
  const tierLabelById = new Map(
    tiersResult.rows.map((tier) => [tier.id, tier.label]),
  );

  const budgetResult = await db.query<{ budget: null | number }>(
    `select "budget" from "auction_rule_set" where "auction_id" = $1`,
    [auctionId],
  );
  const budget = budgetResult.rows[0]?.budget ?? 0;

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

  const salesResult = await db.query<{
    amount: number;
    display_name: string;
    phone_number: null | string;
    player_entry_id: string;
    source: "bid" | "forced";
    team_id: string;
    tier_id: null | string;
  }>(
    `select s."amount", s."source", s."team_id", s."player_entry_id",
            pe."display_name", pe."phone_number", pe."tier_id"
       from "sale" s
       join "player_entry" pe on pe."id" = s."player_entry_id"
      where s."auction_id" = $1 and s."reversed_at" is null
      order by s."created_at" asc, s."id" asc`,
    [auctionId],
  );

  const entriesResult = await db.query<{
    display_name: string;
    id: string;
    is_representative: boolean;
    phone_number: null | string;
    team_id: null | string;
    tier_id: null | string;
  }>(
    `select "id", "display_name", "phone_number", "team_id", "tier_id",
            "is_representative"
       from "player_entry"
      where "auction_id" = $1
      order by "created_at" asc, "id" asc`,
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

  const teamNameById = new Map(
    teamsResult.rows.map((team) => [team.id, team.name]),
  );
  // Roster membership comes from the Player Representative preassignment and
  // from accepted Sales; a Sale does not write back to `player_entry.team_id`,
  // so reading only that column would miss every acquired Player.
  const rosterTeamByPlayerId = new Map<string, string>();
  for (const entry of entriesResult.rows) {
    if (entry.is_representative && entry.team_id) {
      rosterTeamByPlayerId.set(entry.id, entry.team_id);
    }
  }
  for (const sale of salesResult.rows) {
    rosterTeamByPlayerId.set(sale.player_entry_id, sale.team_id);
  }
  const byTeam = new Map<string, ResultsTeamView>();
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

  const addPlayer = (
    teamId: string,
    player: ResultsTeamView["players"][number],
  ) => {
    const team = byTeam.get(teamId);
    if (!team) return;
    team.players.push(player);
    team.rosterCount += 1;
    const key = player.tierId ?? "unassigned";
    team.tierCounts[key] = (team.tierCounts[key] ?? 0) + 1;
  };

  for (const entry of entriesResult.rows) {
    if (!entry.is_representative || !entry.team_id) continue;
    const visible = canViewPhoneNumbers({
      isOnCallerRoster: caller.teamId === entry.team_id,
      phase,
      role: caller.role,
    });
    addPlayer(entry.team_id, {
      amount: 0,
      displayName: entry.display_name,
      phoneNumber: visible ? entry.phone_number : null,
      playerEntryId: entry.id,
      source: "representative",
      tierId: entry.tier_id,
      tierLabel: entry.tier_id
        ? (tierLabelById.get(entry.tier_id) ?? null)
        : null,
    });
  }
  for (const sale of salesResult.rows) {
    const team = byTeam.get(sale.team_id);
    if (!team) continue;
    team.spentCredits += sale.amount;
    team.remainingBudget = budget - team.spentCredits;
    const visible = canViewPhoneNumbers({
      isOnCallerRoster: caller.teamId === sale.team_id,
      phase,
      role: caller.role,
    });
    addPlayer(sale.team_id, {
      amount: sale.amount,
      displayName: sale.display_name,
      phoneNumber: visible ? sale.phone_number : null,
      playerEntryId: sale.player_entry_id,
      source: sale.source,
      tierId: sale.tier_id,
      tierLabel: sale.tier_id
        ? (tierLabelById.get(sale.tier_id) ?? null)
        : null,
    });
  }

  const contacts: ResultsContactRow[] = entriesResult.rows.map((entry) => {
    const contactTeamId = rosterTeamByPlayerId.get(entry.id) ?? null;
    const isOnCallerRoster =
      caller.teamId !== null && contactTeamId === caller.teamId;
    const visible = canViewPhoneNumbers({
      isOnCallerRoster,
      phase,
      role: caller.role,
    });
    return {
      displayName: entry.display_name,
      isRepresentative: entry.is_representative,
      phoneNumber: visible ? entry.phone_number : null,
      phoneWithheld: !visible && entry.phone_number !== null,
      playerEntryId: entry.id,
      teamId: contactTeamId,
      teamName: contactTeamId
        ? (teamNameById.get(contactTeamId) ?? null)
        : null,
      tierLabel: entry.tier_id
        ? (tierLabelById.get(entry.tier_id) ?? null)
        : null,
    };
  });

  return {
    auctionId,
    contacts,
    includesPhoneNumbers: contacts.some(
      (contact) => contact.phoneNumber !== null,
    ),
    phase,
    results: {
      teams: teamsResult.rows.map((team) => byTeam.get(team.id)!),
      unsold: unsoldResult.rows.map((row) => ({
        displayName: row.display_name,
        playerEntryId: row.player_entry_id,
        resolution: row.resolution === "final_unsold" ? "final_unsold" : "open",
      })),
    },
    rulesMode: auction.rules_mode,
    status: auction.status,
    title: auction.title,
    viewerRole: caller.role,
    viewerTeamId: caller.teamId,
  };
}
