import type { Pool, PoolClient } from "pg";

import type { AuctionStatus } from "@/domain/auction";
import { normalizeEmail } from "@/domain/invitation";
import {
  MANAGE_REJECTION_MESSAGES,
  MANAGE_REASON_MAX,
  type ManageRejectionReason,
} from "@/domain/paused-changes";
import {
  addPausedPlayersInputSchema,
  cancelAuctionInputSchema,
  changeConstraintsInputSchema,
  increaseBudgetInputSchema,
  replaceRepresentativeInputSchema,
  transferOwnershipInputSchema,
} from "@/domain/paused-changes";
import {
  PLAYER_ENTRY_LIMITS,
  playerEntryInputSchema,
} from "@/domain/player-entry";
import { auctionKeepsLegalCompletion } from "@/server/auction-command/legal-completion-check";
import {
  bumpRevision,
  findStoredCommand,
  type LiveCommandOutcome,
  type LockedLiveAuction,
  lockLiveAuction,
  rejection,
  storeCommand,
  writeAuditEntry,
} from "@/server/auction-command/live-command";
import { markAuctionDraft } from "@/server/auction-command/lock-editable-auction";
import {
  loadOpenedTierIds,
  loadTeamMinimumStates,
} from "@/server/auction-query/progress";
import { loadRuleSet } from "@/server/auction-query/rules";
import { loadTiers } from "@/server/auction-query/tiers";

/**
 * A controlled-change problem the Organizer can repair that has no stable
 * reason code in the shared vocabulary. Server actions surface the message.
 */
export class ManageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManageError";
  }
}

export interface ManageCommandInput {
  actorUserId: string;
  auctionId: string;
  commandId: string;
  expectedRevision: number;
  reason: string;
}

function reject<T>(
  reason: ManageRejectionReason,
  revision: number,
): LiveCommandOutcome<T> {
  return rejection(MANAGE_REJECTION_MESSAGES[reason], reason, revision);
}

interface Prelude {
  auction: LockedLiveAuction;
  reason: string;
}

type PreludeOutcome<T> =
  { failure: LiveCommandOutcome<T> } | ({ ok: true } & Prelude);

/**
 * The shared opening of every controlled change: the Organizer, an editable
 * lifecycle state, the expected revision, a usable reason, and the idempotency
 * ledger. A Live Auction must be Paused, so a change can never race bidding.
 */
async function openManage<T>(
  client: PoolClient,
  input: ManageCommandInput,
  allowed: readonly AuctionStatus[],
): Promise<PreludeOutcome<T>> {
  const auction = await lockLiveAuction(client, input.auctionId);
  if (!auction || auction.organizerId !== input.actorUserId) {
    return { failure: { status: "unauthorized" } };
  }

  const stored = await findStoredCommand<T>(
    client,
    input.auctionId,
    input.commandId,
  );
  if (stored) {
    return {
      failure:
        stored.actorUserId === input.actorUserId
          ? {
              result: stored.result,
              revision: auction.revision,
              status: "replayed",
            }
          : { status: "unauthorized" },
    };
  }

  if (auction.status === "cancelled") {
    return { failure: reject("auction_cancelled", auction.revision) };
  }
  // A Live Auction must be Paused before any controlled change, so a change can
  // never race bidding. Every other state that is not explicitly allowed — a
  // Completed or Archived Auction — is simply not editable.
  if (auction.status === "live") {
    return {
      failure: reject(
        allowed.includes("paused")
          ? "auction_not_paused"
          : "auction_not_editable",
        auction.revision,
      ),
    };
  }
  if (!allowed.includes(auction.status)) {
    return { failure: reject("auction_not_editable", auction.revision) };
  }
  if (input.expectedRevision !== auction.revision) {
    return { failure: reject("stale_revision", auction.revision) };
  }

  const reason = input.reason.trim();
  if (reason.length === 0 || reason.length > MANAGE_REASON_MAX) {
    return { failure: reject("reason_required", auction.revision) };
  }

  return { auction, ok: true, reason };
}

interface CommitInput {
  actorUserId: string;
  announcement: string;
  auction: LockedLiveAuction;
  auctionId: string;
  commandId: string;
  details: Record<string, unknown>;
  kind: string;
  reason: string;
  result: unknown;
}

/**
 * Commits one accepted change. A Paused Auction advances its revision and
 * publishes a participant announcement; a Draft or Ready Auction has no
 * participants to notify, so it records the immutable Audit Entry and returns
 * to Draft. An invalid attempt commits nothing at all.
 */
async function commitChange(
  client: PoolClient,
  {
    actorUserId,
    announcement,
    auction,
    auctionId,
    commandId,
    details,
    kind,
    reason,
    result,
  }: CommitInput,
): Promise<number> {
  await writeAuditEntry(client, {
    action: kind,
    actorUserId,
    auctionId,
    details,
    reason,
  });
  await storeCommand(client, {
    actorUserId,
    auctionId,
    commandId,
    kind,
    result,
  });

  if (auction.status !== "paused") {
    await markAuctionDraft(client, auctionId);
    return auction.revision;
  }

  return bumpRevision(client, auctionId, kind, { announcement, ...details });
}

interface UserRow {
  email: string;
  email_verified: boolean;
  id: string;
}

/**
 * The registered, verified User an exact normalized email names. The email is
 * compared without case or surrounding whitespace, matching the invitation
 * rule that only the intended person can hold a Team.
 */
async function loadVerifiedUser(
  client: PoolClient,
  email: string,
): Promise<null | UserRow> {
  const result = await client.query<UserRow>(
    `select "id", "email", "emailVerified" as email_verified
       from "user" where lower("email") = $1`,
    [normalizeEmail(email)],
  );
  return result.rows[0] ?? null;
}

export interface ReplaceRepresentativeCommandInput extends ManageCommandInput {
  email: string;
  playerEntryId: null | string;
  teamId: string;
}

export interface RepresentativeChangeResult {
  playerEntryId: null | string;
  teamId: string;
  userId: string;
}

/**
 * Replaces a Team's Representative while the Auction is a Draft, Ready, or
 * Paused, applying the same one-Team-per-User, exact-email, and Organizer
 * separation rules as an initial assignment. Authority is derived from the
 * Team row, so the former Representative loses command and channel access the
 * moment this commits.
 */
export async function replaceTeamRepresentative(
  pool: Pool,
  input: ReplaceRepresentativeCommandInput,
): Promise<LiveCommandOutcome<RepresentativeChangeResult>> {
  const parsed = replaceRepresentativeInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const opened = await openManage<RepresentativeChangeResult>(client, input, [
      "draft",
      "ready",
      "paused",
    ]);
    if ("failure" in opened) {
      await client.query("rollback");
      return opened.failure;
    }
    const { auction, reason } = opened;

    const team = await client.query<{ id: string; name: null | string }>(
      `select "id", "name" from "team" where "id" = $1 and "auction_id" = $2`,
      [parsed.teamId, input.auctionId],
    );
    if (!team.rowCount) {
      await client.query("rollback");
      return reject("team_not_in_auction", auction.revision);
    }

    const user = await loadVerifiedUser(client, parsed.email);
    if (!user) {
      await client.query("rollback");
      return reject("representative_not_registered", auction.revision);
    }
    if (!user.email_verified) {
      await client.query("rollback");
      return reject("representative_email_unverified", auction.revision);
    }
    if (user.id === auction.organizerId) {
      await client.query("rollback");
      return reject("organizer_cannot_represent", auction.revision);
    }
    const conflict = await client.query(
      `select 1 from "team"
        where "auction_id" = $1 and "representative_user_id" = $2 and "id" <> $3`,
      [input.auctionId, user.id, parsed.teamId],
    );
    if (conflict.rowCount && conflict.rowCount > 0) {
      await client.query("rollback");
      return reject("user_already_represents", auction.revision);
    }

    if (parsed.playerEntryId) {
      const entry = await client.query<{ team_id: null | string }>(
        `select "team_id" from "player_entry"
          where "id" = $1 and "auction_id" = $2`,
        [parsed.playerEntryId, input.auctionId],
      );
      if (
        !entry.rowCount ||
        (entry.rows[0]!.team_id !== null &&
          entry.rows[0]!.team_id !== parsed.teamId)
      ) {
        await client.query("rollback");
        return reject("player_entry_unavailable", auction.revision);
      }
      const closed = await client.query(
        `select 1 from "player_presentation"
          where "player_entry_id" = $1
            and "state" in ('open', 'closing', 'sold', 'unsold')
         union all
         select 1 from "sale"
          where "player_entry_id" = $1 and "reversed_at" is null
         limit 1`,
        [parsed.playerEntryId],
      );
      if (closed.rowCount && closed.rowCount > 0) {
        await client.query("rollback");
        return reject("player_entry_unavailable", auction.revision);
      }
    }

    const previous = await client.query<{ id: string }>(
      `select "id" from "player_entry"
        where "team_id" = $1 and "is_representative"`,
      [parsed.teamId],
    );
    await client.query(
      `update "player_entry"
          set "is_representative" = false, "team_id" = null, "updated_at" = now()
        where "team_id" = $1`,
      [parsed.teamId],
    );
    if (parsed.playerEntryId) {
      await client.query(
        `update "player_entry"
            set "is_representative" = true, "team_id" = $2, "updated_at" = now()
          where "id" = $1 and "auction_id" = $3`,
        [parsed.playerEntryId, parsed.teamId, input.auctionId],
      );
    }
    await client.query(
      `update "team"
          set "representative_user_id" = $3,
              "representative_type" = $4,
              "updated_at" = now()
        where "id" = $1 and "auction_id" = $2`,
      [
        parsed.teamId,
        input.auctionId,
        user.id,
        parsed.playerEntryId ? "player" : "outside",
      ],
    );
    await client.query(
      `update "team_invitation"
          set "status" = 'superseded'
        where "team_id" = $1 and "status" = 'pending'`,
      [parsed.teamId],
    );

    if (
      auction.status === "paused" &&
      !(await auctionKeepsLegalCompletion(client, {
        auctionId: input.auctionId,
        rulesMode: auction.rulesMode,
      }))
    ) {
      await client.query("rollback");
      return reject("no_legal_completion", auction.revision);
    }

    const result: RepresentativeChangeResult = {
      playerEntryId: parsed.playerEntryId ?? null,
      teamId: parsed.teamId,
      userId: user.id,
    };
    const revision = await commitChange(client, {
      actorUserId: input.actorUserId,
      announcement: `The Organizer replaced the ${team.rows[0]!.name ?? "Team"} Representative.`,
      auction,
      auctionId: input.auctionId,
      commandId: input.commandId,
      details: {
        previousPlayerEntryId: previous.rows[0]?.id ?? null,
        teamId: parsed.teamId,
        userId: user.id,
      },
      kind: "replace_representative",
      reason,
      result,
    });
    await client.query("commit");
    return { result, revision, status: "accepted" };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export interface TransferOwnershipCommandInput extends ManageCommandInput {
  email: string;
}

export interface OwnershipTransferResult {
  previousOrganizerId: string;
  userId: string;
}

/**
 * Transfers Auction ownership to a registered, verified User who represents no
 * Team in the Auction. It may occur while the Auction is a Draft, Ready, or
 * Paused, and it never changes Bids, Sales, or Rules.
 */
export async function transferOwnership(
  pool: Pool,
  input: TransferOwnershipCommandInput,
): Promise<LiveCommandOutcome<OwnershipTransferResult>> {
  const parsed = transferOwnershipInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const opened = await openManage<OwnershipTransferResult>(client, input, [
      "draft",
      "ready",
      "paused",
    ]);
    if ("failure" in opened) {
      await client.query("rollback");
      return opened.failure;
    }
    const { auction, reason } = opened;

    const user = await loadVerifiedUser(client, parsed.email);
    if (!user) {
      await client.query("rollback");
      return reject("representative_not_registered", auction.revision);
    }
    if (!user.email_verified) {
      await client.query("rollback");
      return reject("representative_email_unverified", auction.revision);
    }
    if (user.id === auction.organizerId) {
      await client.query("rollback");
      return reject("user_belongs_to_auction", auction.revision);
    }
    const represents = await client.query(
      `select 1 from "team"
        where "auction_id" = $1 and "representative_user_id" = $2`,
      [input.auctionId, user.id],
    );
    if (represents.rowCount && represents.rowCount > 0) {
      await client.query("rollback");
      return reject("user_belongs_to_auction", auction.revision);
    }

    await client.query(
      `update "auction"
          set "organizer_id" = $2,
              "ownership_transferred_at" = now(),
              "updated_at" = now()
        where "id" = $1`,
      [input.auctionId, user.id],
    );

    const result: OwnershipTransferResult = {
      previousOrganizerId: auction.organizerId,
      userId: user.id,
    };
    const revision = await commitChange(client, {
      actorUserId: input.actorUserId,
      announcement: "The Organizer transferred ownership of the Auction.",
      auction,
      auctionId: input.auctionId,
      commandId: input.commandId,
      details: {
        fromUserId: auction.organizerId,
        toUserId: user.id,
      },
      kind: "transfer_ownership",
      reason,
      result,
    });
    await client.query("commit");
    return { result, revision, status: "accepted" };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export interface IncreaseBudgetCommandInput extends ManageCommandInput {
  amount: number | string;
}

export interface BudgetIncreaseResult {
  amount: number;
  budget: number;
}

/**
 * Increases every Team's Budget by the same whole-number amount while the
 * Auction is Paused. A Budget can never be decreased or changed for one Team
 * alone, so no Team is advantaged by a correction.
 */
export async function increaseTeamBudgets(
  pool: Pool,
  input: IncreaseBudgetCommandInput,
): Promise<LiveCommandOutcome<BudgetIncreaseResult>> {
  const parsed = increaseBudgetInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const opened = await openManage<BudgetIncreaseResult>(client, input, [
      "paused",
    ]);
    if ("failure" in opened) {
      await client.query("rollback");
      return opened.failure;
    }
    const { auction, reason } = opened;

    const updated = await client.query<{ budget: number }>(
      `update "auction_rule_set"
          set "budget" = "budget" + $2, "updated_at" = now()
        where "auction_id" = $1 and "budget" is not null
        returning "budget"`,
      [input.auctionId, parsed.amount],
    );
    if (!updated.rowCount) {
      await client.query("rollback");
      return reject("auction_not_editable", auction.revision);
    }

    const result: BudgetIncreaseResult = {
      amount: parsed.amount,
      budget: updated.rows[0]!.budget,
    };
    const revision = await commitChange(client, {
      actorUserId: input.actorUserId,
      announcement: `Every Team's Budget increased by ${parsed.amount} Credits to ${updated.rows[0]!.budget}.`,
      auction,
      auctionId: input.auctionId,
      commandId: input.commandId,
      details: { amount: result.amount, budget: result.budget },
      kind: "increase_budget",
      reason,
      result,
    });
    await client.query("commit");
    return { result, revision, status: "accepted" };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export interface AddPausedPlayersCommandInput extends ManageCommandInput {
  players: {
    displayName: string;
    externalPlayerId?: null | string;
    phoneNumber?: null | string;
    role?: null | string;
    tierId?: null | string;
  }[];
}

export interface AddedPlayersResult {
  addedCount: number;
  playerEntryIds: string[];
  tierId: null | string;
}

/**
 * Adds Player Entries to a running Auction while it is Paused. Under Tiered
 * Rules a Player may only join a Tier that has not been offered yet, so current
 * and completed Tier outcomes stay stable, and a Starting Price can never be
 * supplied here because bidding has already begun.
 */
export async function addPausedPlayerEntries(
  pool: Pool,
  input: AddPausedPlayersCommandInput,
): Promise<LiveCommandOutcome<AddedPlayersResult>> {
  const parsed = addPausedPlayersInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const opened = await openManage<AddedPlayersResult>(client, input, [
      "paused",
    ]);
    if ("failure" in opened) {
      await client.query("rollback");
      return opened.failure;
    }
    const { auction, reason } = opened;

    const count = await client.query<{ count: number }>(
      `select count(*)::int as count from "player_entry" where "auction_id" = $1`,
      [input.auctionId],
    );
    if (
      count.rows[0]!.count + parsed.players.length >
      PLAYER_ENTRY_LIMITS.maxEntriesPerAuction
    ) {
      await client.query("rollback");
      return reject("player_limit_reached", auction.revision);
    }

    const tiered = auction.rulesMode === "tiered";
    const tiers = tiered ? await loadTiers(client, input.auctionId) : [];
    const tierIds = new Set(tiers.map((tier) => tier.id));
    let chosenTierId: null | string = null;

    if (tiered) {
      const openedTierIds = await loadOpenedTierIds(client, input.auctionId);
      for (const player of parsed.players) {
        if (!player.tierId || !tierIds.has(player.tierId)) {
          await client.query("rollback");
          return reject("tier_not_in_auction", auction.revision);
        }
        if (openedTierIds.has(player.tierId)) {
          await client.query("rollback");
          return reject("tier_already_opened", auction.revision);
        }
      }
      chosenTierId = parsed.players[0]!.tierId ?? null;
    } else {
      for (const player of parsed.players) {
        if (player.tierId) {
          await client.query("rollback");
          return reject("tier_not_in_auction", auction.revision);
        }
      }
    }

    const existingExternalIds = await client.query<{
      external_player_id: string;
    }>(
      `select "external_player_id" from "player_entry"
        where "auction_id" = $1 and "external_player_id" is not null`,
      [input.auctionId],
    );
    const takenExternalIds = new Set(
      existingExternalIds.rows.map((row) => row.external_player_id),
    );

    const playerEntryIds: string[] = [];
    for (const player of parsed.players) {
      const entry = playerEntryInputSchema.parse({
        displayName: player.displayName,
        externalPlayerId: player.externalPlayerId,
        phoneNumber: player.phoneNumber,
        role: player.role,
      });
      if (entry.externalPlayerId) {
        if (takenExternalIds.has(entry.externalPlayerId)) {
          throw new ManageError(
            "Another Player Entry already uses that External Player ID.",
          );
        }
        takenExternalIds.add(entry.externalPlayerId);
      }
      const inserted = await client.query<{ id: string }>(
        `insert into "player_entry"
            ("auction_id", "display_name", "role", "external_player_id",
             "phone_number", "tier_id")
         values ($1, $2, $3, $4, $5, $6)
         returning "id"`,
        [
          input.auctionId,
          entry.displayName,
          entry.role,
          entry.externalPlayerId,
          entry.phoneNumber,
          tiered ? (player.tierId ?? null) : null,
        ],
      );
      playerEntryIds.push(inserted.rows[0]!.id);
    }

    const result: AddedPlayersResult = {
      addedCount: playerEntryIds.length,
      playerEntryIds,
      tierId: chosenTierId,
    };
    const revision = await commitChange(client, {
      actorUserId: input.actorUserId,
      announcement: `${playerEntryIds.length} Player Entr${
        playerEntryIds.length === 1 ? "y was" : "ies were"
      } added to the Auction.`,
      auction,
      auctionId: input.auctionId,
      commandId: input.commandId,
      details: {
        addedCount: playerEntryIds.length,
        playerEntryIds,
        tierId: chosenTierId,
      },
      kind: "add_players",
      reason,
      result,
    });
    await client.query("commit");
    return { result, revision, status: "accepted" };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export interface ChangeConstraintsCommandInput extends ManageCommandInput {
  rosterMax?: number | string;
  rosterMin?: number | string;
  tiers?: { maxPerTeam: number; minPerTeam: number; tierId: string }[];
}

export interface ConstraintsChangeResult {
  rosterMax: number;
  rosterMin: number;
  tiers: { maxPerTeam: number; minPerTeam: number; tierId: string }[];
}

/**
 * Applies the permitted Rule changes to a Paused Auction: total and Tier
 * minimums and maximums. It cannot move a Sold Player between Tiers, lower a
 * maximum below what a Team already holds, alter a completed Sale, or leave
 * the Auction without a Legal Completion.
 */
export async function changePausedConstraints(
  pool: Pool,
  input: ChangeConstraintsCommandInput,
): Promise<LiveCommandOutcome<ConstraintsChangeResult>> {
  const parsed = changeConstraintsInputSchema.parse({
    reason: input.reason,
    rosterMax: input.rosterMax,
    rosterMin: input.rosterMin,
    tiers: input.tiers ?? [],
  });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const opened = await openManage<ConstraintsChangeResult>(client, input, [
      "paused",
    ]);
    if ("failure" in opened) {
      await client.query("rollback");
      return opened.failure;
    }
    const { auction, reason } = opened;

    const ruleSet = await loadRuleSet(client, input.auctionId);
    if (ruleSet.rosterMin === null || ruleSet.rosterMax === null) {
      await client.query("rollback");
      return reject("auction_not_editable", auction.revision);
    }

    const tiers = await loadTiers(client, input.auctionId);
    const states = await loadTeamMinimumStates(
      client,
      input.auctionId,
      tiers.map((tier) => tier.id),
    );

    const rosterMax = parsed.rosterMax ?? ruleSet.rosterMax;
    const rosterMin = parsed.rosterMin ?? ruleSet.rosterMin;
    if (rosterMin > rosterMax) {
      throw new ManageError(
        "Minimum Roster size cannot exceed the maximum Roster size.",
      );
    }
    const highestRoster = states.reduce(
      (highest, state) => Math.max(highest, state.rosterCount),
      0,
    );
    if (rosterMax < highestRoster) {
      await client.query("rollback");
      return reject("maximum_below_current_count", auction.revision);
    }

    const tierIndexById = new Map(tiers.map((tier, index) => [tier.id, index]));
    const tierById = new Map(tiers.map((tier) => [tier.id, tier]));
    for (const change of parsed.tiers) {
      if (!tierById.has(change.tierId)) {
        await client.query("rollback");
        return reject("tier_not_in_auction", auction.revision);
      }
      if (change.minPerTeam > change.maxPerTeam) {
        throw new ManageError(
          `The "${tierById.get(change.tierId)!.label}" Tier minimum cannot exceed its maximum.`,
        );
      }
      const index = tierIndexById.get(change.tierId)!;
      const highest = states.reduce(
        (max, state) => Math.max(max, state.tierCounts[index] ?? 0),
        0,
      );
      if (change.maxPerTeam < highest) {
        await client.query("rollback");
        return reject("maximum_below_current_count", auction.revision);
      }
    }

    await client.query(
      `update "auction_rule_set"
          set "roster_min" = $2, "roster_max" = $3, "updated_at" = now()
        where "auction_id" = $1`,
      [input.auctionId, rosterMin, rosterMax],
    );
    for (const change of parsed.tiers) {
      await client.query(
        `update "tier"
            set "min_per_team" = $3, "max_per_team" = $4, "updated_at" = now()
          where "id" = $1 and "auction_id" = $2`,
        [change.tierId, input.auctionId, change.minPerTeam, change.maxPerTeam],
      );
    }

    if (
      !(await auctionKeepsLegalCompletion(client, {
        auctionId: input.auctionId,
        rulesMode: auction.rulesMode,
      }))
    ) {
      await client.query("rollback");
      return reject("no_legal_completion", auction.revision);
    }

    const result: ConstraintsChangeResult = {
      rosterMax,
      rosterMin,
      tiers: parsed.tiers,
    };
    const revision = await commitChange(client, {
      actorUserId: input.actorUserId,
      announcement: "The Organizer updated the Auction constraints.",
      auction,
      auctionId: input.auctionId,
      commandId: input.commandId,
      details: {
        rosterMax: result.rosterMax,
        rosterMin: result.rosterMin,
        tiers: result.tiers,
      },
      kind: "change_constraints",
      reason,
      result,
    });
    await client.query("commit");
    return { result, revision, status: "accepted" };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Cancelling a Live Auction needs only the shared reason and revision. */
export type CancelAuctionCommandInput = ManageCommandInput;

export interface CancellationResult {
  cancelledAt: string;
}

/**
 * Cancels a Live Auction while it is Paused. A Cancelled Auction is
 * permanently read-only: it cannot resume, and every later live command is
 * refused because it only ever accepts a Live or Paused Auction.
 */
export async function cancelLiveAuction(
  pool: Pool,
  input: CancelAuctionCommandInput,
): Promise<LiveCommandOutcome<CancellationResult>> {
  const parsed = cancelAuctionInputSchema.parse({ reason: input.reason });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const opened = await openManage<CancellationResult>(client, input, [
      "paused",
    ]);
    if ("failure" in opened) {
      await client.query("rollback");
      return opened.failure;
    }
    const { auction, reason } = opened;

    const cancelled = await client.query<{ cancelled_at: Date }>(
      `update "auction"
          set "status" = 'cancelled',
              "cancelled_at" = now(),
              "cancelled_reason" = $2,
              "active_tier_id" = null,
              "updated_at" = now()
        where "id" = $1
        returning "cancelled_at"`,
      [input.auctionId, parsed.reason],
    );
    // An Active Player cannot be sold by a cancelled Auction, so the
    // Presentation is closed as returned. Its committed history is untouched.
    await client.query(
      `update "player_presentation"
          set "state" = 'returned', "return_reason" = $2,
              "closed_at" = coalesce("closed_at", now()),
              "warning_deadline" = null, "close_deadline" = null,
              "updated_at" = now()
        where "auction_id" = $1 and "state" in ('open', 'closing')`,
      [input.auctionId, parsed.reason],
    );

    const result: CancellationResult = {
      cancelledAt: cancelled.rows[0]!.cancelled_at.toISOString(),
    };
    const revision = await commitChange(client, {
      actorUserId: input.actorUserId,
      announcement: "The Organizer cancelled the Auction.",
      auction,
      auctionId: input.auctionId,
      commandId: input.commandId,
      details: { cancelledAt: result.cancelledAt },
      kind: "cancel_auction",
      reason,
      result,
    });
    await client.query("commit");
    return { result, revision, status: "accepted" };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
