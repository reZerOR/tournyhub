import { afterAll, describe, expect, it } from "vitest";

import { TeamLogoError } from "@/domain/team-logo";
import { createPlayerEntry } from "@/server/auction-command/player-entries";
import { assignPlayerRepresentative } from "@/server/auction-command/representatives";
import {
  applyCalculatedTeams,
  createTeam,
  deleteTeam,
  removeTeamLogo,
  reorderTeams,
  setTeamLogo,
  TeamSetupError,
  updateTeam,
} from "@/server/auction-command/teams";
import { getTeamsForOrganizer } from "@/server/auction-query/teams";
import {
  cleanupTestUsers,
  createTestAuction,
  createTestUser,
  createTestUserWithEmail,
  pool,
  setAuctionStatus,
  uniqueTestEmail,
} from "./support";

/** A 5x5 RGBA PNG, valid input for the logo pipeline. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAO0lEQVR4nF3JMRWAMBAE0YFEwopYERFxciiRgtPlkSqk+M0MQIxSOBcjD5UD64usTix2jfItiVWfl78X1G0NKcru2FAAAAAASUVORK5CYII=",
  "base64",
);

afterAll(cleanupTestUsers);

async function setup(label: string) {
  const organizerId = await createTestUser(label);
  const auction = await createTestAuction(organizerId);
  return { auctionId: auction.id, organizerId };
}

describe("createTeam", () => {
  it("creates a Team with a normalized name and lowercase color", async () => {
    const { auctionId, organizerId } = await setup("create");

    const team = await createTeam(pool, organizerId, auctionId, {
      color: "#ABCDEF",
      name: "  Red   Comets ",
    });

    expect(team).toMatchObject({
      auctionId,
      color: "#abcdef",
      name: "Red Comets",
      normalizedName: "red comets",
      representativeType: null,
      representativeUserId: null,
    });
  });

  it("rejects a name that normalizes onto another Team", async () => {
    const { auctionId, organizerId } = await setup("duplicate");
    await createTeam(pool, organizerId, auctionId, { name: "Red Comets" });

    await expect(
      createTeam(pool, organizerId, auctionId, { name: "  red   comets " }),
    ).rejects.toThrow(TeamSetupError);
  });

  it("refuses more than 32 Teams", async () => {
    const { auctionId, organizerId } = await setup("cap");
    await pool.query(
      `insert into "team" ("auction_id", "name", "normalized_name", "position")
       select $1, 'Team ' || g, 'team ' || g, g from generate_series(1, 32) as g`,
      [auctionId],
    );

    await expect(
      createTeam(pool, organizerId, auctionId, { name: "One Too Many" }),
    ).rejects.toThrow(TeamSetupError);
  });

  it("returns null for an unrelated Organizer or a non-editable Auction", async () => {
    const owner = await setup("guarded-owner");
    const unrelatedId = await createTestUser("guarded-unrelated");

    expect(
      await createTeam(pool, unrelatedId, owner.auctionId, {
        name: "Intruder",
      }),
    ).toBeNull();

    await setAuctionStatus(owner.auctionId, "completed");
    expect(
      await createTeam(pool, owner.organizerId, owner.auctionId, {
        name: "Too Late",
      }),
    ).toBeNull();
  });
});

describe("updateTeam, reorderTeams, and deleteTeam", () => {
  it("renames and recolors, rejecting another Team's name", async () => {
    const { auctionId, organizerId } = await setup("update");
    const first = await createTeam(pool, organizerId, auctionId, {
      name: "Reds",
    });
    await createTeam(pool, organizerId, auctionId, { name: "Blues" });

    const updated = await updateTeam(pool, organizerId, auctionId, first!.id, {
      color: "#112233",
      name: "Crimson",
    });
    expect(updated).toMatchObject({ color: "#112233", name: "Crimson" });

    await expect(
      updateTeam(pool, organizerId, auctionId, first!.id, { name: "Blues" }),
    ).rejects.toThrow(TeamSetupError);
  });

  it("reorders Teams by the supplied order", async () => {
    const { auctionId, organizerId } = await setup("reorder");
    const first = await createTeam(pool, organizerId, auctionId, {
      name: "First",
    });
    const second = await createTeam(pool, organizerId, auctionId, {
      name: "Second",
    });

    const ordered = await reorderTeams(pool, organizerId, auctionId, [
      second!.id,
      first!.id,
    ]);
    expect(ordered?.map((team) => team.name)).toEqual(["Second", "First"]);

    expect(
      await reorderTeams(pool, organizerId, auctionId, [second!.id]),
    ).toBeNull();
  });

  it("clears a Player Representative when its Team is removed", async () => {
    const { auctionId, organizerId } = await setup("delete");
    const team = await createTeam(pool, organizerId, auctionId, {
      name: "Reds",
    });
    const entry = await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "Alice",
    });
    const representativeEmail = uniqueTestEmail("delete-rep");
    await createTestUserWithEmail(representativeEmail, "delete-rep");
    await assignPlayerRepresentative(pool, organizerId, auctionId, {
      email: representativeEmail,
      playerEntryId: entry!.id,
      teamId: team!.id,
    });

    expect(await deleteTeam(pool, organizerId, auctionId, team!.id)).toBe(true);

    const entryRow = await pool.query<{
      is_representative: boolean;
      team_id: null | string;
    }>(
      `select "is_representative", "team_id" from "player_entry" where "id" = $1`,
      [entry!.id],
    );
    expect(entryRow.rows[0]).toEqual({
      is_representative: false,
      team_id: null,
    });
  });
});

describe("applyCalculatedTeams", () => {
  it("creates unnamed Teams and keeps the entered Roster limits", async () => {
    const { auctionId, organizerId } = await setup("calculate");
    await pool.query(
      `insert into "player_entry" ("auction_id", "display_name")
       select $1, 'Player ' || g from generate_series(1, 30) as g`,
      [auctionId],
    );

    const applied = await applyCalculatedTeams(pool, organizerId, auctionId, {
      count: 5,
      maxRosterSize: 10,
      minRosterSize: 5,
      playerCount: 30,
      preassignedRepresentativeCount: 0,
    });

    expect(applied?.result.feasibleCounts).toEqual([3, 4, 5, 6]);
    expect(applied?.teams).toHaveLength(5);
    expect(applied?.teams.every((team) => team.name === null)).toBe(true);

    const ruleSet = await pool.query<{
      roster_max: number;
      roster_min: number;
    }>(
      `select "roster_min", "roster_max" from "auction_rule_set" where "auction_id" = $1`,
      [auctionId],
    );
    expect(ruleSet.rows[0]).toEqual({ roster_max: 10, roster_min: 5 });
  });

  it("refuses a count that is not feasible", async () => {
    const { auctionId, organizerId } = await setup("calculate-infeasible");
    await pool.query(
      `insert into "player_entry" ("auction_id", "display_name")
       select $1, 'Player ' || g from generate_series(1, 10) as g`,
      [auctionId],
    );

    await expect(
      applyCalculatedTeams(pool, organizerId, auctionId, {
        count: 9,
        maxRosterSize: 5,
        minRosterSize: 2,
        playerCount: 10,
        preassignedRepresentativeCount: 0,
      }),
    ).rejects.toThrow(TeamSetupError);
    expect(await getTeamsForOrganizer(pool, organizerId, auctionId)).toEqual(
      [],
    );
  });
});

describe("Team logos", () => {
  it("stores a re-encoded logo under a random key and clears it", async () => {
    const { auctionId, organizerId } = await setup("logo");
    const team = await createTeam(pool, organizerId, auctionId, {
      name: "Reds",
    });

    const stored = await setTeamLogo(
      pool,
      organizerId,
      auctionId,
      team!.id,
      PNG,
    );
    expect(stored?.logoStorageKey).toMatch(
      new RegExp(`^${auctionId}/[0-9a-f-]+\\.png$`),
    );

    const object = await pool.query<{
      byte_size: number;
      content_type: string;
    }>(
      `select "content_type", "byte_size" from "stored_object" where "key" = $1`,
      [stored!.logoStorageKey],
    );
    expect(object.rows[0]!.content_type).toBe("image/png");
    expect(object.rows[0]!.byte_size).toBeGreaterThan(0);

    expect(await removeTeamLogo(pool, organizerId, auctionId, team!.id)).toBe(
      true,
    );
    const cleared = await pool.query<{ logo_storage_key: null | string }>(
      `select "logo_storage_key" from "team" where "id" = $1`,
      [team!.id],
    );
    expect(cleared.rows[0]!.logo_storage_key).toBeNull();
  });

  it("rejects bytes that are not a PNG", async () => {
    const { auctionId, organizerId } = await setup("logo-invalid");
    const team = await createTeam(pool, organizerId, auctionId, {
      name: "Reds",
    });

    await expect(
      setTeamLogo(pool, organizerId, auctionId, team!.id, Buffer.from("nope")),
    ).rejects.toThrow(TeamLogoError);
  });
});
