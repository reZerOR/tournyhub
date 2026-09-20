import type { AuctionStatus, CloseMode, RulesMode } from "@/domain/auction";
import type { Queryable } from "@/server/database/queryable";

export interface ManagePersonView {
  email: string;
  name: string;
  userId: string;
}

export interface ManageTeamView {
  id: string;
  name: null | string;
  /** The Player Entry currently preassigned as this Team's Player Representative. */
  playerEntry: null | { displayName: string; id: string };
  position: number;
  representative: null | ManagePersonView;
}

export interface ManageTierView {
  biddableCount: number;
  id: string;
  label: string;
  maxPerTeam: number;
  minPerTeam: number;
  /** True once any Player in this Tier has been offered, so it can no longer grow. */
  opened: boolean;
  offeredCount: number;
  position: number;
  startingPrice: number;
}

export interface AuctionManagement {
  auctionId: string;
  closeMode: CloseMode;
  canChangeConstraints: boolean;
  canManageSetup: boolean;
  organizer: null | ManagePersonView;
  /** Player Entries that may still become a Player Representative. */
  selectableEntries: { displayName: string; id: string }[];
  revision: number;
  rules: {
    bidIncrement: null | number;
    budget: null | number;
    defaultStartingPrice: null | number;
    rosterMax: null | number;
    rosterMin: null | number;
    timedCloseSeconds: number;
  } | null;
  rulesMode: RulesMode;
  status: AuctionStatus;
  teams: ManageTeamView[];
  tiers: ManageTierView[];
}

const MANAGEABLE_STATUSES = ["draft", "ready", "paused"] as const;

function isManageable(status: AuctionStatus): boolean {
  return (MANAGEABLE_STATUSES as readonly AuctionStatus[]).includes(status);
}

/**
 * The state the Organizer's management page needs, or null when the caller
 * does not organize this Auction or it is not in a state a controlled change
 * may be made in. An unrelated Organizer and a missing Auction are
 * indistinguishable to the caller.
 */
export async function getAuctionManagementForOrganizer(
  db: Queryable,
  organizerId: string,
  auctionId: string,
): Promise<null | AuctionManagement> {
  const auctionResult = await db.query<{
    close_mode: CloseMode;
    hidden_at: Date | null;
    organizer_id: string;
    revision: number;
    rules_mode: RulesMode;
    status: AuctionStatus;
  }>(
    `select "organizer_id", "status", "revision", "rules_mode", "close_mode",
            "hidden_at"
       from "auction" where "id" = $1`,
    [auctionId],
  );
  const auction = auctionResult.rows[0];
  if (!auction || auction.organizer_id !== organizerId) return null;
  if (auction.hidden_at !== null) return null;
  if (!isManageable(auction.status)) return null;

  // Sequential reads keep this usable on a single transaction client.
  const teamsResult = await db.query<{
    id: string;
    name: null | string;
    position: number;
    representative_user_id: null | string;
  }>(
    `select "id", "name", "position", "representative_user_id"
       from "team" where "auction_id" = $1
      order by "position" asc, "created_at" asc, "id" asc`,
    [auctionId],
  );
  const entriesResult = await db.query<{
    display_name: string;
    id: string;
    is_representative: boolean;
    team_id: null | string;
  }>(
    `select pe."id", pe."display_name", pe."is_representative", pe."team_id"
       from "player_entry" pe
      where pe."auction_id" = $1
        and not exists (
          select 1 from "player_presentation" pp
           where pp."player_entry_id" = pe."id"
             and pp."state" in ('open', 'closing', 'sold', 'unsold'))
        and not exists (
          select 1 from "sale" s
           where s."player_entry_id" = pe."id" and s."reversed_at" is null)
      order by pe."created_at" asc, pe."id" asc`,
    [auctionId],
  );
  const rulesResult = await db.query<{
    bid_increment: null | number;
    budget: null | number;
    default_starting_price: null | number;
    roster_max: null | number;
    roster_min: null | number;
    timed_close_seconds: number;
  }>(
    `select "budget", "bid_increment", "roster_min", "roster_max",
            "default_starting_price", "timed_close_seconds"
       from "auction_rule_set" where "auction_id" = $1`,
    [auctionId],
  );
  const tiersResult = await db.query<{
    biddable_count: number;
    id: string;
    label: string;
    max_per_team: number;
    min_per_team: number;
    opened: boolean;
    offered_count: number;
    position: number;
    starting_price: number;
  }>(
    `select t."id", t."label", t."position", t."starting_price",
            t."min_per_team", t."max_per_team",
            count(pe."id")::int as "biddable_count",
            count(pe."id") filter (where exists (
              select 1 from "player_presentation" pp
               where pp."player_entry_id" = pe."id"
                 and pp."state" in ('sold', 'unsold')))::int as "offered_count",
            exists (
              select 1 from "player_presentation" tp
               where tp."auction_id" = t."auction_id"
                 and tp."tier_id" = t."id") as "opened"
       from "tier" t
       left join "player_entry" pe
         on pe."tier_id" = t."id" and not pe."is_representative"
      where t."auction_id" = $1
      group by t."id"
      order by t."position" asc`,
    [auctionId],
  );

  const representativeIds = [
    ...new Set(
      teamsResult.rows.flatMap((team) =>
        team.representative_user_id ? [team.representative_user_id] : [],
      ),
    ),
  ];
  const usersById = new Map<string, ManagePersonView>();
  if (representativeIds.length > 0) {
    const users = await db.query<{
      email: string;
      id: string;
      name: string;
    }>(
      `select "id", "name", "email" from "user" where "id" = any($1::text[])`,
      [representativeIds],
    );
    for (const user of users.rows) {
      usersById.set(user.id, {
        email: user.email,
        name: user.name,
        userId: user.id,
      });
    }
  }

  const organizerResult = await db.query<{
    email: string;
    id: string;
    name: string;
  }>(`select "id", "name", "email" from "user" where "id" = $1`, [
    auction.organizer_id,
  ]);
  const organizerRow = organizerResult.rows[0];

  const playerEntryByTeam = new Map<
    string,
    { displayName: string; id: string }
  >();
  for (const entry of entriesResult.rows) {
    if (entry.is_representative && entry.team_id) {
      playerEntryByTeam.set(entry.team_id, {
        displayName: entry.display_name,
        id: entry.id,
      });
    }
  }

  const teams: ManageTeamView[] = teamsResult.rows.map((team) => ({
    id: team.id,
    name: team.name,
    playerEntry: playerEntryByTeam.get(team.id) ?? null,
    position: team.position,
    representative: team.representative_user_id
      ? (usersById.get(team.representative_user_id) ?? null)
      : null,
  }));

  return {
    auctionId,
    canChangeConstraints: auction.status === "paused",
    canManageSetup: true,
    closeMode: auction.close_mode,
    organizer: organizerRow
      ? {
          email: organizerRow.email,
          name: organizerRow.name,
          userId: organizerRow.id,
        }
      : null,
    revision: auction.revision,
    rules: rulesResult.rows[0]
      ? {
          bidIncrement: rulesResult.rows[0].bid_increment,
          budget: rulesResult.rows[0].budget,
          defaultStartingPrice: rulesResult.rows[0].default_starting_price,
          rosterMax: rulesResult.rows[0].roster_max,
          rosterMin: rulesResult.rows[0].roster_min,
          timedCloseSeconds: rulesResult.rows[0].timed_close_seconds,
        }
      : null,
    rulesMode: auction.rules_mode,
    selectableEntries: entriesResult.rows
      .filter((entry) => !entry.is_representative || entry.team_id === null)
      .map((entry) => ({ displayName: entry.display_name, id: entry.id })),
    status: auction.status,
    teams,
    tiers: tiersResult.rows.map((tier) => ({
      biddableCount: tier.biddable_count,
      id: tier.id,
      label: tier.label,
      maxPerTeam: tier.max_per_team,
      minPerTeam: tier.min_per_team,
      offeredCount: tier.offered_count,
      opened: tier.offered_count > 0,
      position: tier.position,
      startingPrice: tier.starting_price,
    })),
  };
}
