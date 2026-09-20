import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import {
  calculateFeasibleTeamCounts,
  calculateTeamsInputSchema,
  type CalculateTeamsInput,
  type TeamCountResult,
} from "@/domain/team-calculator";
import {
  createTeamInputSchema,
  normalizeTeamName,
  TEAM_LIMITS,
  type CreateTeamInput,
  type Team,
  updateTeamInputSchema,
  type UpdateTeamInput,
} from "@/domain/team";
import {
  lockEditableAuction,
  markAuctionDraft,
} from "@/server/auction-command/lock-editable-auction";
import {
  getTeamsForOrganizer,
  loadTeamRow,
  mapTeamRow,
  type TeamRow,
} from "@/server/auction-query/teams";
import { isUniqueViolation } from "@/server/database/pg-error";
import { reencodePng } from "@/server/images/png";
import { deleteObject, putObject } from "@/server/storage/object-store";

/** A Team setup rule the Organizer can repair, as opposed to an unexpected failure. */
export class TeamSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamSetupError";
  }
}

async function assertTeamCapacity(
  client: PoolClient,
  auctionId: string,
): Promise<void> {
  const result = await client.query<{ count: number }>(
    `select count(*)::int as count from "team" where "auction_id" = $1`,
    [auctionId],
  );
  if (result.rows[0]!.count >= TEAM_LIMITS.maxTeams) {
    throw new TeamSetupError(
      `An Auction can hold at most ${TEAM_LIMITS.maxTeams} Teams.`,
    );
  }
}

async function assertTeamNameFree(
  client: PoolClient,
  auctionId: string,
  name: string,
  exceptTeamId?: string,
): Promise<void> {
  const result = await client.query(
    `select "id" from "team"
      where "auction_id" = $1 and "normalized_name" = $2
        and ($3::uuid is null or "id" <> $3)`,
    [auctionId, normalizeTeamName(name), exceptTeamId ?? null],
  );
  if (result.rowCount && result.rowCount > 0) {
    throw new TeamSetupError("Another Team already uses that name.");
  }
}

async function nextTeamPosition(
  client: PoolClient,
  auctionId: string,
): Promise<number> {
  const result = await client.query<{ next: number }>(
    `select coalesce(max("position"), -1) + 1 as next from "team" where "auction_id" = $1`,
    [auctionId],
  );
  return result.rows[0]!.next;
}

/** Adds a Team with a required, Auction-unique name. Returns null when the Auction is not editable by this Organizer. */
export async function createTeam(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  input: CreateTeamInput,
): Promise<null | Team> {
  const parsed = createTeamInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }

    await assertTeamCapacity(client, auctionId);
    await assertTeamNameFree(client, auctionId, parsed.name);
    const position = await nextTeamPosition(client, auctionId);

    const inserted = await client.query<TeamRow>(
      `insert into "team"
          ("auction_id", "name", "normalized_name", "color", "position")
       values ($1, $2, $3, $4, $5)
       returning *`,
      [
        auctionId,
        parsed.name,
        normalizeTeamName(parsed.name),
        parsed.color,
        position,
      ],
    );
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return mapTeamRow(inserted.rows[0]!);
  } catch (error) {
    await client.query("rollback");
    if (isUniqueViolation(error)) {
      throw new TeamSetupError("Another Team already uses that name.");
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Renames or recolors a Team. Returns null when it is not editable by this Organizer. */
export async function updateTeam(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  teamId: string,
  input: UpdateTeamInput,
): Promise<null | Team> {
  const parsed = updateTeamInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }
    if (!(await loadTeamRow(client, auctionId, teamId))) {
      await client.query("rollback");
      return null;
    }

    await assertTeamNameFree(client, auctionId, parsed.name, teamId);
    const updated = await client.query<TeamRow>(
      `update "team"
          set "name" = $3,
              "normalized_name" = $4,
              "color" = $5,
              "updated_at" = now()
        where "id" = $1 and "auction_id" = $2
        returning *`,
      [
        teamId,
        auctionId,
        parsed.name,
        normalizeTeamName(parsed.name),
        parsed.color,
      ],
    );
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return mapTeamRow(updated.rows[0]!);
  } catch (error) {
    await client.query("rollback");
    if (isUniqueViolation(error)) {
      throw new TeamSetupError("Another Team already uses that name.");
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Removes a Team, its invitations, and its Player Representative assignment. Returns false when it is not editable by this Organizer. */
export async function deleteTeam(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  teamId: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return false;
    }

    const team = await loadTeamRow(client, auctionId, teamId);
    if (!team) {
      await client.query("rollback");
      return false;
    }

    if (team.logo_storage_key) {
      await deleteObject(client, team.logo_storage_key);
    }
    await client.query(
      `update "player_entry"
          set "is_representative" = false, "team_id" = null, "updated_at" = now()
        where "team_id" = $1`,
      [teamId],
    );
    await client.query(
      `delete from "team" where "id" = $1 and "auction_id" = $2`,
      [teamId, auctionId],
    );
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Reorders a Team by its position in `orderedTeamIds`. Returns null when it is not editable by this Organizer. */
export async function reorderTeams(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  orderedTeamIds: string[],
): Promise<null | Team[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }

    const existing = await client.query<{ id: string }>(
      `select "id" from "team" where "auction_id" = $1`,
      [auctionId],
    );
    const known = new Set(existing.rows.map((row) => row.id));
    const requested = new Set(orderedTeamIds);
    if (
      orderedTeamIds.length !== known.size ||
      requested.size !== known.size ||
      orderedTeamIds.some((id) => !known.has(id))
    ) {
      await client.query("rollback");
      return null;
    }

    for (const [position, id] of orderedTeamIds.entries()) {
      await client.query(
        `update "team" set "position" = $3, "updated_at" = now()
          where "id" = $1 and "auction_id" = $2`,
        [id, auctionId, position],
      );
    }
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return getTeamsForOrganizer(pool, organizerId, auctionId);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Stores a validated, re-encoded logo under a random key. Returns null when the Team is not editable by this Organizer. */
export async function setTeamLogo(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  teamId: string,
  bytes: Uint8Array,
): Promise<null | Team> {
  const reencoded = reencodePng(bytes);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }
    const team = await loadTeamRow(client, auctionId, teamId);
    if (!team) {
      await client.query("rollback");
      return null;
    }

    const key = `${auctionId}/${randomUUID()}.png`;
    await putObject(client, {
      auctionId,
      bytes: reencoded.bytes,
      contentType: "image/png",
      key,
    });
    const updated = await client.query<TeamRow>(
      `update "team"
          set "logo_storage_key" = $3, "updated_at" = now()
        where "id" = $1 and "auction_id" = $2
        returning *`,
      [teamId, auctionId, key],
    );
    if (team.logo_storage_key) {
      await deleteObject(client, team.logo_storage_key);
    }
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return mapTeamRow(updated.rows[0]!);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Clears a Team logo. Returns false when it is not editable by this Organizer. */
export async function removeTeamLogo(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  teamId: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return false;
    }
    const team = await loadTeamRow(client, auctionId, teamId);
    if (!team) {
      await client.query("rollback");
      return false;
    }

    if (team.logo_storage_key) {
      await deleteObject(client, team.logo_storage_key);
      await client.query(
        `update "team"
            set "logo_storage_key" = null, "updated_at" = now()
          where "id" = $1 and "auction_id" = $2`,
        [teamId, auctionId],
      );
    }
    await markAuctionDraft(client, auctionId);
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export interface AppliedTeams {
  result: TeamCountResult;
  teams: Team[];
}

/**
 * Creates the calculated number of unnamed Teams and keeps the entered total
 * Roster limits for the later Rules step. Returns null when the Auction is not
 * editable by this Organizer.
 */
export async function applyCalculatedTeams(
  pool: Pool,
  organizerId: string,
  auctionId: string,
  input: CalculateTeamsInput & { count: number },
): Promise<null | AppliedTeams> {
  const basis = calculateTeamsInputSchema.parse(input);
  const count = input.count;
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (!(await lockEditableAuction(client, organizerId, auctionId))) {
      await client.query("rollback");
      return null;
    }

    const result = calculateFeasibleTeamCounts(basis);
    if (!result.feasibleCounts.includes(count)) {
      await client.query("rollback");
      throw new TeamSetupError(
        result.explanation ||
          `${count} Teams is not a feasible Team count for the current Players.`,
      );
    }

    const existing = await client.query<{ count: number }>(
      `select count(*)::int as count from "team" where "auction_id" = $1`,
      [auctionId],
    );
    if (existing.rows[0]!.count + count > TEAM_LIMITS.maxTeams) {
      await client.query("rollback");
      throw new TeamSetupError(
        `An Auction can hold at most ${TEAM_LIMITS.maxTeams} Teams.`,
      );
    }

    const startingPosition = await nextTeamPosition(client, auctionId);
    for (let index = 0; index < count; index += 1) {
      await client.query(
        `insert into "team" ("auction_id", "position") values ($1, $2)`,
        [auctionId, startingPosition + index],
      );
    }
    await client.query(
      `insert into "auction_rule_set" ("auction_id", "roster_min", "roster_max")
       values ($1, $2, $3)
       on conflict ("auction_id") do update
         set "roster_min" = excluded."roster_min",
             "roster_max" = excluded."roster_max",
             "updated_at" = now()`,
      [auctionId, basis.minRosterSize, basis.maxRosterSize],
    );
    await markAuctionDraft(client, auctionId);
    await client.query("commit");

    const teams = await getTeamsForOrganizer(pool, organizerId, auctionId);
    return { result, teams: teams ?? [] };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
