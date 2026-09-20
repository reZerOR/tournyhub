import type { CloseMode, RulesMode } from "@/domain/auction";
import {
  isLiveStatus,
  nextBidAmount,
  type LiveActivePlayer,
  type LiveBidRejection,
  type LiveCallerPrivateState,
  type LiveSnapshot,
  type LiveTeamPublicState,
  type LiveTierProgress,
} from "@/domain/live";
import type { BidRejectionReason } from "@/domain/live";
import { deficientTeamIds } from "@/domain/matching";
import {
  loadOpenSales,
  loadOpenUnsoldRound,
  loadRoundOfferedPlayerIds,
  loadTeamMinimumStates,
  loadTierProgress,
  loadUnsoldPool,
} from "@/server/auction-query/progress";
import type { Queryable } from "@/server/database/queryable";

interface AuctionRow {
  active_tier_id: null | string;
  close_mode: CloseMode;
  organizer_id: string;
  revision: number;
  rules_mode: RulesMode;
  status: string;
}

interface PresentationRow {
  close_deadline: Date | null;
  display_name: string;
  id: string;
  player_entry_id: string;
  role: null | string;
  selection_method: "forced" | "manual" | "random";
  starting_price: number;
  state: "closing" | "open";
  tier_id: null | string;
  tier_label: null | string;
  warning_deadline: Date | null;
}

interface TeamRow {
  color: null | string;
  id: string;
  name: null | string;
  position: number;
}

interface BidRow {
  amount: number;
  team_id: string;
}

interface RejectionRow {
  amount: number;
  reason: BidRejectionReason;
  server_time: Date;
  team_id: string;
}

export interface ActivePresentation {
  displayName: string;
  id: string;
  playerEntryId: string;
  tierId: null | string;
}

/** The single Active Player Presentation, or null when none is offered. */
export async function loadActivePresentation(
  db: Queryable,
  auctionId: string,
): Promise<null | ActivePresentation> {
  const result = await db.query<{
    display_name: string;
    id: string;
    player_entry_id: string;
    tier_id: null | string;
  }>(
    `select pp."id", pp."player_entry_id", pp."tier_id", pe."display_name"
       from "player_presentation" pp
       join "player_entry" pe on pe."id" = pp."player_entry_id"
      where pp."auction_id" = $1 and pp."state" in ('open', 'closing')
      limit 1`,
    [auctionId],
  );
  const row = result.rows[0];
  return row
    ? {
        displayName: row.display_name,
        id: row.id,
        playerEntryId: row.player_entry_id,
        tierId: row.tier_id,
      }
    : null;
}

/** Why a User may open the live console: Organizer, Representative, or neither. */
export async function resolveLiveRole(
  db: Queryable,
  userId: string,
  auctionId: string,
): Promise<null | {
  role: "organizer" | "representative";
  teamId: null | string;
}> {
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
  if (row.team_id) return { role: "representative", teamId: row.team_id };
  return null;
}

export type LiveAccess = null | {
  role: "organizer" | "representative";
  snapshot: LiveSnapshot;
  teamId: null | string;
};

/**
 * The full authorized snapshot for one caller. Returns null for an unrelated
 * User or an Auction that is not currently Live or Paused, so an unrelated
 * caller cannot learn that a protected Auction exists.
 */
export async function getLiveSnapshot(
  db: Queryable,
  userId: string,
  auctionId: string,
): Promise<LiveAccess> {
  const auctionResult = await db.query<AuctionRow>(
    `select "organizer_id", "status", "revision", "rules_mode", "close_mode",
            "active_tier_id"
       from "auction" where "id" = $1 and "hidden_at" is null`,
    [auctionId],
  );
  const auction = auctionResult.rows[0];
  if (!auction || !isLiveStatus(auction.status)) return null;

  const role = await resolveLiveRole(db, userId, auctionId);
  if (!role) return null;

  const [presentationResult, teamsResult, tierResult] = await Promise.all([
    db.query<PresentationRow>(
      `select pp."id", pp."player_entry_id", pp."tier_id", pp."starting_price",
              pp."selection_method", pp."state", pp."warning_deadline",
              pp."close_deadline", pe."display_name", pe."role",
              t."label" as tier_label
         from "player_presentation" pp
         join "player_entry" pe on pe."id" = pp."player_entry_id"
         left join "tier" t on t."id" = pp."tier_id"
        where pp."auction_id" = $1 and pp."state" in ('open', 'closing')
        limit 1`,
      [auctionId],
    ),
    db.query<TeamRow>(
      `select "id", "name", "color", "position" from "team"
        where "auction_id" = $1
        order by "position" asc, "created_at" asc, "id" asc`,
      [auctionId],
    ),
    db.query<{
      id: string;
      label: string;
      max_per_team: number;
      min_per_team: number;
      position: number;
    }>(
      `select "id", "label", "max_per_team", "min_per_team", "position"
         from "tier" where "auction_id" = $1
        order by "position" asc`,
      [auctionId],
    ),
  ]);

  const presentation = presentationResult.rows[0] ?? null;
  const tiers = tierResult.rows;

  const [
    spendResult,
    tierCountsResult,
    bidResult,
    rejectionResult,
    timeResult,
  ] = await Promise.all([
    db.query<{
      team_id: string;
      sale_count: number;
      spent: number;
    }>(
      `select t."id" as team_id,
                coalesce(sum(s."amount") filter (where s."reversed_at" is null), 0)::int as spent,
                count(s."id") filter (where s."reversed_at" is null)::int as sale_count
           from "team" t
           left join "sale" s on s."team_id" = t."id"
          where t."auction_id" = $1
          group by t."id"`,
      [auctionId],
    ),
    db.query<{ count: number; team_id: string; tier_id: null | string }>(
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
    ),
    presentation
      ? db.query<BidRow>(
          `select "amount", "team_id" from "bid_attempt"
              where "presentation_id" = $1 and "status" = 'accepted'
              order by "amount" desc limit 1`,
          [presentation.id],
        )
      : Promise.resolve({ rows: [] as BidRow[] }),
    presentation
      ? db.query<RejectionRow>(
          `select "amount", "reason", "server_time", "team_id"
               from "bid_attempt"
              where "presentation_id" = $1 and "status" = 'rejected'
              order by "server_time" desc, "id" desc
              limit 25`,
          [presentation.id],
        )
      : Promise.resolve({ rows: [] as RejectionRow[] }),
    db.query<{ now: Date }>(`select now() as now`),
  ]);

  const spendByTeam = new Map(
    spendResult.rows.map((row) => [row.team_id, row]),
  );
  const tierCountsByTeam = new Map<string, Record<string, number>>();
  for (const row of tierCountsResult.rows) {
    const counts = tierCountsByTeam.get(row.team_id) ?? {};
    const key = row.tier_id ?? "unassigned";
    counts[key] = (counts[key] ?? 0) + row.count;
    tierCountsByTeam.set(row.team_id, counts);
  }

  const currentBid = bidResult.rows[0] ?? null;
  const leaderTeamId = currentBid?.team_id ?? null;

  const teams: LiveTeamPublicState[] = teamsResult.rows.map((team) => {
    const spend = spendByTeam.get(team.id);
    return {
      color: team.color,
      id: team.id,
      isLeader: team.id === leaderTeamId,
      name: team.name,
      position: team.position,
      remainingBudget: Math.max(0, 0),
      rosterCount: 0,
      spentCredits: spend?.spent ?? 0,
      tierCounts: tierCountsByTeam.get(team.id) ?? {},
    };
  });

  const rules = await db.query<{
    budget: null | number;
    roster_max: null | number;
    roster_min: null | number;
  }>(
    `select "budget", "roster_min", "roster_max"
       from "auction_rule_set" where "auction_id" = $1`,
    [auctionId],
  );
  const budget = rules.rows[0]?.budget ?? 0;
  const rosterMax = rules.rows[0]?.roster_max ?? 0;
  const rosterMin = rules.rows[0]?.roster_min ?? 0;

  for (const team of teams) {
    const spend = spendByTeam.get(team.id);
    const counts = tierCountsByTeam.get(team.id) ?? {};
    const rosterCount = Object.values(counts).reduce(
      (total, count) => total + count,
      0,
    );
    team.rosterCount = rosterCount;
    team.remainingBudget = Math.max(0, budget - (spend?.spent ?? 0));
  }

  const callerTeam =
    role.role === "representative"
      ? (teams.find((team) => team.id === role.teamId) ?? null)
      : null;

  const tierLimits: Record<string, { max: number; min: number }> = {};
  for (const tier of tiers) {
    tierLimits[tier.id] = { max: tier.max_per_team, min: tier.min_per_team };
  }

  const you: LiveCallerPrivateState = {
    isLeader: callerTeam?.isLeader ?? false,
    maxRoster: rosterMax,
    remainingBudget: callerTeam?.remainingBudget ?? 0,
    role: role.role,
    rosterCount: callerTeam?.rosterCount ?? 0,
    spentCredits: callerTeam?.spentCredits ?? 0,
    teamId: role.teamId,
    tierCounts: callerTeam?.tierCounts ?? {},
    tierLimits,
  };

  const rejections: LiveBidRejection[] = rejectionResult.rows
    .filter((row) => role.role === "organizer" || row.team_id === role.teamId)
    .map((row) => ({
      amount: row.amount,
      reason: row.reason,
      serverTime: row.server_time.toISOString(),
    }));

  const activePlayer: LiveActivePlayer | null = presentation
    ? {
        closeDeadline: presentation.close_deadline
          ? presentation.close_deadline.toISOString()
          : null,
        displayName: presentation.display_name,
        presentationId: presentation.id,
        playerEntryId: presentation.player_entry_id,
        role: presentation.role,
        selectionMethod: presentation.selection_method,
        startingPrice: presentation.starting_price,
        state: presentation.state,
        tierId: presentation.tier_id,
        tierLabel: presentation.tier_label,
        warningDeadline: presentation.warning_deadline
          ? presentation.warning_deadline.toISOString()
          : null,
      }
    : null;

  const increment = await db.query<{
    bid_increment: null | number;
    timed_close_seconds: number;
  }>(
    `select "bid_increment", "timed_close_seconds"
       from "auction_rule_set" where "auction_id" = $1`,
    [auctionId],
  );
  const bidIncrement = increment.rows[0]?.bid_increment ?? 0;
  const nextBid = presentation
    ? nextBidAmount({
        bidIncrement,
        currentAmount: currentBid?.amount ?? null,
        startingPrice: presentation.starting_price,
      })
    : null;

  const [progress, openRound, pool, openSales] = await Promise.all([
    loadTierProgress(db, auctionId),
    loadOpenUnsoldRound(db, auctionId),
    loadUnsoldPool(db, auctionId, 0),
    loadOpenSales(db, auctionId),
  ]);

  const orderedTierIds = tiers.map((tier) => tier.id);
  const minimumStates = await loadTeamMinimumStates(
    db,
    auctionId,
    orderedTierIds,
  );
  const deficient = deficientTeamIds({
    rosterMin: rosterMin ?? 0,
    teams: minimumStates,
    tiers: tiers.map((tier) => ({ minPerTeam: tier.min_per_team })),
  });

  const liveTiers: LiveTierProgress[] = progress.map((tier) => ({
    biddableCount: tier.biddableCount,
    complete: tier.offeredCount >= tier.biddableCount,
    id: tier.id,
    isActive: tier.id === auction.active_tier_id,
    label: tier.label,
    offeredCount: tier.offeredCount,
    position: tier.position,
  }));
  const nextTier = liveTiers.find((tier) => !tier.complete) ?? null;

  const round = openRound
    ? {
        eligibleCount: pool.length,
        id: openRound.id,
        offeredCount: (await loadRoundOfferedPlayerIds(db, openRound.id)).size,
        sequence: openRound.sequence,
      }
    : null;

  const eligible = await db.query<{ count: number }>(
    `select count(*)::int as count from "player_entry" pe
      where pe."auction_id" = $1 and not pe."is_representative"
        ${auction.rules_mode === "tiered" ? `and pe."tier_id" = $2` : ""}
        and not exists (
          select 1 from "player_presentation" pp
           where pp."player_entry_id" = pe."id"
             and pp."state" in ('open', 'closing', 'sold', 'unsold'))
        and not exists (
          select 1 from "sale" s
           where s."player_entry_id" = pe."id" and s."reversed_at" is null)`,
    auction.rules_mode === "tiered" && auction.active_tier_id
      ? [auctionId, auction.active_tier_id]
      : auction.rules_mode === "tiered"
        ? [auctionId, null]
        : [auctionId],
  );

  return {
    role: role.role,
    snapshot: {
      activePlayer,
      activeTierId: auction.active_tier_id,
      auctionId,
      closeMode: auction.close_mode,
      currentBid: currentBid
        ? { amount: currentBid.amount, teamId: currentBid.team_id }
        : null,
      deficientTeamIds: deficient,
      eligiblePlayerCount: eligible.rows[0]?.count ?? 0,
      lifecycle: auction.status === "paused" ? "paused" : "live",
      nextBidAmount: nextBid,
      nextTierId: nextTier?.id ?? null,
      openSales,
      revision: auction.revision,
      rulesMode: auction.rules_mode,
      serverTime: timeResult.rows[0]!.now.toISOString(),
      teams,
      tierCountsEnabled: auction.rules_mode === "tiered",
      tiers: liveTiers,
      timedCloseSeconds:
        auction.close_mode === "timed"
          ? (increment.rows[0]?.timed_close_seconds ?? null)
          : null,
      unsoldPoolCount: pool.length,
      unsoldRound: round,
      you,
      rejections,
    },
    teamId: role.teamId,
  };
}
