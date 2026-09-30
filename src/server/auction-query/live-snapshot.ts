import type { CloseMode, RulesMode } from "@/domain/auction";
import {
  isLiveStatus,
  nextBidAmount,
  type LiveActivePlayer,
  type LiveBidItem,
  type LiveBidRejection,
  type LiveCallerPrivateState,
  type LiveCustomFieldValue,
  type LivePlayerDetails,
  type LiveRepresentative,
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
import { loadLivePlayers } from "./live-players";

export function isMobileField(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return (
    normalized.includes("phone") ||
    normalized.includes("mobile") ||
    normalized.includes("cell") ||
    normalized.includes("whatsapp") ||
    normalized.includes("contact number")
  );
}

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
  external_player_id: null | string;
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
  representative_user_id: null | string;
}

interface BidRow {
  amount: number;
  id: string;
  server_time: Date;
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

  const [presentationResult, teamsResult, tierResult] = await Promise.all([
    db.query<PresentationRow>(
      `select pp."id", pp."player_entry_id", pp."tier_id", pp."starting_price",
              pp."selection_method", pp."state", pp."warning_deadline",
              pp."close_deadline", pe."display_name", pe."role",
              pe."external_player_id",
              t."label" as tier_label
         from "player_presentation" pp
         join "player_entry" pe on pe."id" = pp."player_entry_id"
         left join "tier" t on t."id" = pp."tier_id"
        where pp."auction_id" = $1 and pp."state" in ('open', 'closing')
        limit 1`,
      [auctionId],
    ),
    db.query<TeamRow>(
      `select "id", "name", "color", "position", "representative_user_id"
         from "team"
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
      starting_price: number;
    }>(
      `select "id", "label", "max_per_team", "min_per_team", "position",
              "starting_price"
         from "tier" where "auction_id" = $1
        order by "position" asc`,
      [auctionId],
    ),
  ]);

  const presentation = presentationResult.rows[0] ?? null;
  const tiers = tierResult.rows;
  const orderedTierIds = tiers.map((tier) => tier.id);

  // The role comes from rows already fetched: the Organizer from the Auction,
  // a Representative from the Team that names this User. Resolving it in its
  // own query re-read the Auction row on every snapshot.
  const representativeTeam = teamsResult.rows.find(
    (team) => team.representative_user_id === userId,
  );
  const role =
    auction.organizer_id === userId
      ? ({ role: "organizer", teamId: null } as const)
      : representativeTeam
        ? ({ role: "representative", teamId: representativeTeam.id } as const)
        : null;
  if (!role) return null;

  const [
    minimumStates,
    bidResult,
    rejectionResult,
    timeResult,
    openSales,
    playerRepsResult,
    activeCustomFieldsResult,
  ] = await Promise.all([
    loadTeamMinimumStates(db, auctionId, orderedTierIds),
    presentation
      ? db.query<BidRow>(
          `select "id", "amount", "team_id", "server_time" from "bid_attempt"
              where "presentation_id" = $1 and "status" = 'accepted'
              order by "server_time" asc, "amount" asc`,
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
    loadOpenSales(db, auctionId),
    db.query<{
      display_name: string;
      id: string;
      team_id: string;
      tier_id: null | string;
    }>(
      `select pe."id", pe."display_name", pe."team_id", pe."tier_id"
         from "player_entry" pe
        where pe."auction_id" = $1 and pe."is_representative" and pe."team_id" is not null`,
      [auctionId],
    ),
    presentation
      ? db.query<{ id: string; label: string; value: string }>(
          `select cpf."id", cpf."label", pecv."value"
             from "player_entry_custom_value" pecv
             join "custom_player_field" cpf on cpf."id" = pecv."custom_player_field_id"
            where pecv."player_entry_id" = $1
            order by cpf."created_at" asc, cpf."id" asc`,
          [presentation.player_entry_id],
        )
      : Promise.resolve({
          rows: [] as { id: string; label: string; value: string }[],
        }),
  ]);

  const minimumStateById = new Map(
    minimumStates.map((state) => [state.id, state]),
  );
  const tierCountsByTeam = new Map<string, Record<string, number>>();
  for (const state of minimumStates) {
    const counts: Record<string, number> = {};
    let assigned = 0;
    orderedTierIds.forEach((tierId, index) => {
      const count = state.tierCounts[index] ?? 0;
      if (count > 0) {
        counts[tierId] = count;
        assigned += count;
      }
    });
    // A Representative with no Tier is absent from the per-Tier counts, so the
    // remainder of the roster is the "unassigned" bucket the client expects.
    const unassigned = state.rosterCount - assigned;
    if (unassigned > 0) counts.unassigned = unassigned;
    tierCountsByTeam.set(state.id, counts);
  }

  const bids: LiveBidItem[] = bidResult.rows.map((row) => ({
    amount: row.amount,
    id: row.id,
    serverTime: row.server_time.toISOString(),
    teamId: row.team_id,
  }));
  const currentBid = bids.length > 0 ? bids[bids.length - 1]! : null;
  const leaderTeamId = currentBid?.teamId ?? null;

  const teams: LiveTeamPublicState[] = teamsResult.rows.map((team) => {
    const state = minimumStateById.get(team.id);

    return {
      color: team.color,
      id: team.id,
      isLeader: team.id === leaderTeamId,
      name: team.name,
      position: team.position,
      remainingBudget: Math.max(0, 0),
      rosterCount: 0,
      spentCredits: state?.spentCredits ?? 0,
      tierCounts: tierCountsByTeam.get(team.id) ?? {},
    };
  });

  // The roster is assembled from these plus `openSales`, so the same Player
  // Representative is sent once rather than inside its Team as well.
  const representatives: LiveRepresentative[] = playerRepsResult.rows.map(
    (row) => ({
      displayName: row.display_name,
      id: row.id,
      teamId: row.team_id,
      tierId: row.tier_id,
    }),
  );

  // One read of the Rule Set serves the Budget, Roster limits, Bid Increment and
  // Timed Close duration. It is a single row, so reading it twice only adds a
  // round trip to every snapshot.
  const rules = await db.query<{
    bid_increment: null | number;
    budget: null | number;
    roster_max: null | number;
    roster_min: null | number;
    timed_close_seconds: number;
  }>(
    `select "budget", "roster_min", "roster_max", "bid_increment",
            "timed_close_seconds"
       from "auction_rule_set" where "auction_id" = $1`,
    [auctionId],
  );
  const ruleSet = rules.rows[0];
  const budget = ruleSet?.budget ?? 0;
  const rosterMax = ruleSet?.roster_max ?? 0;
  const rosterMin = ruleSet?.roster_min ?? 0;

  for (const team of teams) {
    const state = minimumStateById.get(team.id);
    team.rosterCount = state?.rosterCount ?? 0;
    team.remainingBudget = Math.max(0, budget - (state?.spentCredits ?? 0));
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

  const customFields: LiveCustomFieldValue[] = activeCustomFieldsResult.rows
    .filter((row) => !isMobileField(row.label))
    .map((row) => ({
      id: row.id,
      label: row.label,
      value: row.value,
    }));

  const activePlayer: LiveActivePlayer | null = presentation
    ? {
        closeDeadline: presentation.close_deadline
          ? presentation.close_deadline.toISOString()
          : null,
        customFields,
        displayName: presentation.display_name,
        externalPlayerId: presentation.external_player_id,
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

  const bidIncrement = ruleSet?.bid_increment ?? 0;
  const nextBid = presentation
    ? nextBidAmount({
        bidIncrement,
        currentAmount: currentBid?.amount ?? null,
        startingPrice: presentation.starting_price,
      })
    : null;

  const [progress, openRound, pool, players] = await Promise.all([
    loadTierProgress(db, auctionId),
    loadOpenUnsoldRound(db, auctionId),
    loadUnsoldPool(db, auctionId, 0),
    loadLivePlayers(db, auctionId),
  ]);

  const deficient = deficientTeamIds({
    rosterMin: rosterMin ?? 0,
    teams: minimumStates,
    tiers: tiers.map((tier) => ({ minPerTeam: tier.min_per_team })),
  });

  const liveTiers: LiveTierProgress[] = progress.map((tier) => {
    const matchingTier = tiers.find((t) => t.id === tier.id);
    return {
      biddableCount: tier.biddableCount,
      complete: tier.offeredCount >= tier.biddableCount,
      id: tier.id,
      isActive: tier.id === auction.active_tier_id,
      label: tier.label,
      maxPerTeam: matchingTier?.max_per_team ?? 0,
      minPerTeam: matchingTier?.min_per_team ?? 0,
      offeredCount: tier.offeredCount,
      position: tier.position,
      startingPrice: matchingTier?.starting_price ?? 0,
    };
  });
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
      bids,
      closeMode: auction.close_mode,
      currentBid: currentBid
        ? { amount: currentBid.amount, teamId: currentBid.teamId }
        : null,
      deficientTeamIds: deficient,
      eligiblePlayerCount: eligible.rows[0]?.count ?? 0,
      lifecycle: auction.status === "paused" ? "paused" : "live",
      nextBidAmount: nextBid,
      nextTierId: nextTier?.id ?? null,
      openSales,
      players,
      representatives,
      revision: auction.revision,
      rulesMode: auction.rules_mode,
      serverTime: timeResult.rows[0]!.now.toISOString(),
      teams,
      tierCountsEnabled: auction.rules_mode === "tiered",
      tiers: liveTiers,
      timedCloseSeconds:
        auction.close_mode === "timed"
          ? (ruleSet?.timed_close_seconds ?? null)
          : null,
      unsoldPoolCount: pool.length,
      unsoldRound: round,
      you,
      rejections,
    },
    teamId: role.teamId,
  };
}

/**
 * Loads full player details for live view (active lot, queue, or roster).
 * Excludes sensitive fields like mobile/phone number.
 */
export async function getLivePlayerDetails(
  db: Queryable,
  auctionId: string,
  playerEntryId: string,
): Promise<LivePlayerDetails | null> {
  const result = await db.query<{
    display_name: string;
    external_player_id: null | string;
    id: string;
    is_representative: boolean;
    role: null | string;
    starting_price_override: null | number;
    team_color: null | string;
    team_id: null | string;
    team_name: null | string;
    tier_id: null | string;
    tier_label: null | string;
    tier_starting_price: null | number;
  }>(
    `select pe."id", pe."display_name", pe."role", pe."external_player_id",
            pe."starting_price_override", pe."is_representative", pe."tier_id",
            t."label" as tier_label, t."starting_price" as tier_starting_price,
            coalesce(s."team_id", pe."team_id") as team_id,
            tm."name" as team_name, tm."color" as team_color
       from "player_entry" pe
       left join "tier" t on t."id" = pe."tier_id"
       left join "sale" s on s."player_entry_id" = pe."id" and s."reversed_at" is null
       left join "team" tm on tm."id" = coalesce(s."team_id", pe."team_id")
      where pe."id" = $1 and pe."auction_id" = $2
      limit 1`,
    [playerEntryId, auctionId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const customResult = await db.query<{
    id: string;
    label: string;
    value: string;
  }>(
    `select cpf."id", cpf."label", pecv."value"
       from "player_entry_custom_value" pecv
       join "custom_player_field" cpf on cpf."id" = pecv."custom_player_field_id"
      where pecv."player_entry_id" = $1
      order by cpf."created_at" asc, cpf."id" asc`,
    [playerEntryId],
  );

  const customFields: LiveCustomFieldValue[] = customResult.rows
    .filter((f) => !isMobileField(f.label))
    .map((f) => ({
      id: f.id,
      label: f.label,
      value: f.value,
    }));

  return {
    customFields,
    displayName: row.display_name,
    externalPlayerId: row.external_player_id,
    id: row.id,
    isRepresentative: row.is_representative,
    role: row.role,
    startingPrice:
      row.starting_price_override ?? row.tier_starting_price ?? null,
    teamColor: row.team_color,
    teamName: row.team_name,
    tierId: row.tier_id,
    tierLabel: row.tier_label,
  };
}
