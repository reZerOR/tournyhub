import { afterAll, describe, expect, it } from "vitest";

import { createPlayerEntry } from "@/server/auction-command/player-entries";
import {
  assignPlayerRepresentative,
  removeRepresentative,
  RepresentativeError,
} from "@/server/auction-command/representatives";
import { createTeamInvitation } from "@/server/auction-command/team-invitations";
import { createTeam } from "@/server/auction-command/teams";
import { getRepresentativesForOrganizer } from "@/server/auction-query/representatives";
import {
  cleanupTestUsers,
  createTestAuction,
  createTestUser,
  createTestUserWithEmail,
  pool,
  uniqueTestEmail,
} from "./support";

afterAll(cleanupTestUsers);

/** Registers a verified User and returns the exact email to address them by. */
async function registerRepresentative(label: string): Promise<string> {
  const email = uniqueTestEmail(label);
  await createTestUserWithEmail(email, label);
  return email;
}

async function setup(label: string) {
  const organizerId = await createTestUser(label);
  const auction = await createTestAuction(organizerId);
  const team = await createTeam(pool, organizerId, auction.id, {
    name: "Reds",
  });
  const otherTeam = await createTeam(pool, organizerId, auction.id, {
    name: "Blues",
  });
  const entry = await createPlayerEntry(pool, organizerId, auction.id, {
    displayName: "Alice",
  });
  return {
    auctionId: auction.id,
    entryId: entry!.id,
    organizerId,
    otherTeamId: otherTeam!.id,
    teamId: team!.id,
  };
}

describe("assignPlayerRepresentative", () => {
  it("links a registered User and Player Entry as the Team's Player Representative", async () => {
    const { auctionId, entryId, organizerId, teamId } = await setup("assign");
    const email = await registerRepresentative("assign-rep");

    const team = await assignPlayerRepresentative(
      pool,
      organizerId,
      auctionId,
      {
        email,
        playerEntryId: entryId,
        teamId,
      },
    );

    expect(team).toMatchObject({
      representativeType: "player",
      representativeUserId: expect.any(String),
    });

    const entry = await pool.query<{
      is_representative: boolean;
      team_id: string;
    }>(
      `select "is_representative", "team_id" from "player_entry" where "id" = $1`,
      [entryId],
    );
    expect(entry.rows[0]).toEqual({ is_representative: true, team_id: teamId });
  });

  it("refuses the Organizer representing their own Team", async () => {
    const { auctionId, entryId, organizerId, teamId } =
      await setup("assign-organizer");
    const organizerEmail = (
      await pool.query<{ email: string }>(
        `select "email" from "user" where "id" = $1`,
        [organizerId],
      )
    ).rows[0]!.email;

    await expect(
      assignPlayerRepresentative(pool, organizerId, auctionId, {
        email: organizerEmail,
        playerEntryId: entryId,
        teamId,
      }),
    ).rejects.toThrow(/Organizer/);
  });

  it("refuses a User who already represents another Team", async () => {
    const { auctionId, entryId, organizerId, otherTeamId, teamId } =
      await setup("assign-conflict");
    const email = await registerRepresentative("assign-conflict");
    const secondEntry = await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "Bob",
    });
    await assignPlayerRepresentative(pool, organizerId, auctionId, {
      email,
      playerEntryId: entryId,
      teamId,
    });

    await expect(
      assignPlayerRepresentative(pool, organizerId, auctionId, {
        email,
        playerEntryId: secondEntry!.id,
        teamId: otherTeamId,
      }),
    ).rejects.toThrow(RepresentativeError);
  });

  it("refuses a Player Entry that already represents another Team", async () => {
    const { auctionId, entryId, organizerId, otherTeamId, teamId } =
      await setup("assign-entry-conflict");
    const firstEmail = await registerRepresentative("entry-a");
    const secondEmail = await registerRepresentative("entry-b");
    await assignPlayerRepresentative(pool, organizerId, auctionId, {
      email: firstEmail,
      playerEntryId: entryId,
      teamId,
    });

    await expect(
      assignPlayerRepresentative(pool, organizerId, auctionId, {
        email: secondEmail,
        playerEntryId: entryId,
        teamId: otherTeamId,
      }),
    ).rejects.toThrow(/already represents/);
  });

  it("refuses an email that is not a registered, verified User", async () => {
    const { auctionId, entryId, organizerId, teamId } =
      await setup("assign-unknown");

    await expect(
      assignPlayerRepresentative(pool, organizerId, auctionId, {
        email: uniqueTestEmail("nobody"),
        playerEntryId: entryId,
        teamId,
      }),
    ).rejects.toThrow(/registered/);
  });

  it("replaces the existing representative and supersedes pending invitations", async () => {
    const { auctionId, entryId, organizerId, teamId } = await setup("replace");
    const firstEmail = await registerRepresentative("first");
    const secondEmail = await registerRepresentative("second");
    await assignPlayerRepresentative(pool, organizerId, auctionId, {
      email: firstEmail,
      playerEntryId: entryId,
      teamId,
    });
    await createTeamInvitation(pool, organizerId, auctionId, {
      email: uniqueTestEmail("outside"),
      teamId,
    });

    const secondEntry = await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: "Bob",
    });
    const team = await assignPlayerRepresentative(
      pool,
      organizerId,
      auctionId,
      {
        email: secondEmail,
        playerEntryId: secondEntry!.id,
        teamId,
      },
    );

    const firstEntry = await pool.query<{ is_representative: boolean }>(
      `select "is_representative" from "player_entry" where "id" = $1`,
      [entryId],
    );
    expect(firstEntry.rows[0]!.is_representative).toBe(false);
    expect(team?.representativeType).toBe("player");

    const invitations = await pool.query<{ status: string }>(
      `select "status" from "team_invitation" where "team_id" = $1`,
      [teamId],
    );
    expect(invitations.rows[0]!.status).toBe("superseded");
  });
});

describe("removeRepresentative and reading representatives", () => {
  it("clears the representative and the Player preassignment", async () => {
    const { auctionId, entryId, organizerId, teamId } = await setup("remove");
    const email = await registerRepresentative("remove-rep");
    await assignPlayerRepresentative(pool, organizerId, auctionId, {
      email,
      playerEntryId: entryId,
      teamId,
    });

    expect(
      await removeRepresentative(pool, organizerId, auctionId, teamId),
    ).toBe(true);

    const entry = await pool.query<{
      is_representative: boolean;
      team_id: null | string;
    }>(
      `select "is_representative", "team_id" from "player_entry" where "id" = $1`,
      [entryId],
    );
    expect(entry.rows[0]).toEqual({
      is_representative: false,
      team_id: null,
    });
  });

  it("returns each Team with its representative and pending invitation", async () => {
    const { auctionId, entryId, organizerId, otherTeamId, teamId } =
      await setup("read");
    const email = await registerRepresentative("read-rep");
    await assignPlayerRepresentative(pool, organizerId, auctionId, {
      email,
      playerEntryId: entryId,
      teamId,
    });
    const pendingEmail = uniqueTestEmail("pending");
    await createTeamInvitation(pool, organizerId, auctionId, {
      email: pendingEmail,
      teamId: otherTeamId,
    });

    const views = await getRepresentativesForOrganizer(
      pool,
      organizerId,
      auctionId,
    );

    expect(views).toHaveLength(2);
    const reds = views!.find((view) => view.team.name === "Reds")!;
    expect(reds.user?.email).toBe(email);
    expect(reds.playerEntry?.displayName).toBe("Alice");
    const blues = views!.find((view) => view.team.name === "Blues")!;
    expect(blues.invitation?.email).toBe(pendingEmail);
  });
});
