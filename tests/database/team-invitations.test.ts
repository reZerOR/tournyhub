import { afterAll, describe, expect, it } from "vitest";

import { digestInvitationToken } from "@/domain/invitation";
import {
  acceptTeamInvitation,
  InvitationError,
} from "@/server/auction-command/team-invitations";
import { createTeam } from "@/server/auction-command/teams";
import type { EmailSender, InvitationEmailMessage } from "@/server/email/types";
import { issueTeamInvitation } from "@/server/invitations/issue-team-invitation";
import {
  cleanupTestUsers,
  createTestAuction,
  createTestUser,
  createTestUserWithEmail,
  pool,
  uniqueTestEmail,
} from "./support";

afterAll(cleanupTestUsers);

function createCapturingSender(): {
  sender: EmailSender;
  sent: InvitationEmailMessage[];
} {
  const sent: InvitationEmailMessage[] = [];
  return {
    sender: {
      async sendInvitationEmail(message) {
        sent.push(message);
      },
      async sendOtpEmail() {},
    },
    sent,
  };
}

const failingSender: EmailSender = {
  async sendInvitationEmail() {
    throw new Error("smtp is down");
  },
  async sendOtpEmail() {},
};

interface Context {
  auctionId: string;
  organizerId: string;
  teamId: string;
}

async function setup(label: string): Promise<Context> {
  const organizerId = await createTestUser(label);
  const auction = await createTestAuction(organizerId);
  const team = await createTeam(pool, organizerId, auction.id, {
    name: "Reds",
  });
  return { auctionId: auction.id, organizerId, teamId: team!.id };
}

async function invite(
  label: string,
  send: EmailSender = createCapturingSender().sender,
): Promise<Context & { email: string; token: string }> {
  const context = await setup(label);
  const email = uniqueTestEmail(label);
  const issued = await issueTeamInvitation({
    emailSender: send,
    input: {
      auctionId: context.auctionId,
      email,
      organizerId: context.organizerId,
      teamId: context.teamId,
    },
    pool,
  });
  return { ...context, email, token: issued!.token };
}

describe("issuing invitations", () => {
  it("stores a digest, sends the link, and supersedes the older pending invitation", async () => {
    const { auctionId, organizerId, teamId } = await setup("issue");
    const { sender, sent } = createCapturingSender();
    const email = uniqueTestEmail("issue-invitee");

    const first = await issueTeamInvitation({
      emailSender: sender,
      input: { auctionId, email, organizerId, teamId },
      pool,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.link).toContain(`/invitations/${first!.token}`);
    expect(sent[0]!.teamName).toBe("Reds");

    const second = await issueTeamInvitation({
      emailSender: sender,
      input: { auctionId, email, organizerId, teamId },
      pool,
    });

    const rows = await pool.query<{ status: string; token_digest: string }>(
      `select "status", "token_digest" from "team_invitation" where "team_id" = $1`,
      [teamId],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.filter((row) => row.status === "pending")).toHaveLength(1);
    // The raw tokens are never stored.
    expect(rows.rows.map((row) => row.token_digest)).not.toContain(
      first!.token,
    );
    expect(rows.rows.map((row) => row.token_digest)).toContain(
      digestInvitationToken(second!.token),
    );
  });

  it("revokes the invitation when delivery fails", async () => {
    const { auctionId, organizerId, teamId } = await setup("delivery");

    await expect(
      issueTeamInvitation({
        emailSender: failingSender,
        input: {
          auctionId,
          email: uniqueTestEmail("delivery-invitee"),
          organizerId,
          teamId,
        },
        pool,
      }),
    ).rejects.toThrow(InvitationError);

    const rows = await pool.query(
      `select 1 from "team_invitation" where "team_id" = $1 and "status" = 'pending'`,
      [teamId],
    );
    expect(rows.rowCount).toBe(0);
  });
});

describe("accepting invitations", () => {
  it("lets an invited User whose account is registered later accept", async () => {
    const { auctionId, email, teamId, token } = await invite("accept");
    const userId = await createTestUserWithEmail(email, "accept-invitee");

    const accepted = await acceptTeamInvitation(pool, userId, token);

    expect(accepted).toEqual({ auctionId, teamId });
    const team = await pool.query<{
      representative_type: string;
      representative_user_id: string;
    }>(
      `select "representative_type", "representative_user_id" from "team" where "id" = $1`,
      [teamId],
    );
    expect(team.rows[0]).toEqual({
      representative_type: "outside",
      representative_user_id: userId,
    });
    // An Outside Representative consumes no Roster position.
    const entries = await pool.query(
      `select 1 from "player_entry" where "team_id" = $1`,
      [teamId],
    );
    expect(entries.rowCount).toBe(0);
  });

  it("rejects a User with a different verified email", async () => {
    const { token } = await invite("wrong-email");
    const otherId = await createTestUserWithEmail(
      uniqueTestEmail("wrong-email-user"),
      "wrong",
    );

    await expect(acceptTeamInvitation(pool, otherId, token)).rejects.toThrow(
      /different email/,
    );
  });

  it("rejects a replayed token", async () => {
    const { email, token } = await invite("replay");
    const userId = await createTestUserWithEmail(email, "replay");
    await acceptTeamInvitation(pool, userId, token);

    await expect(acceptTeamInvitation(pool, userId, token)).rejects.toThrow(
      /already been accepted/,
    );
  });

  it("rejects an expired invitation", async () => {
    const { email, teamId, token } = await invite("expired");
    await pool.query(
      `update "team_invitation" set "expires_at" = now() - interval '1 minute' where "team_id" = $1`,
      [teamId],
    );
    const userId = await createTestUserWithEmail(email, "expired");

    await expect(acceptTeamInvitation(pool, userId, token)).rejects.toThrow(
      /expired/,
    );
  });

  it("rejects a superseded invitation", async () => {
    const context = await setup("superseded");
    const email = uniqueTestEmail("superseded");
    const { sender } = createCapturingSender();
    const first = await issueTeamInvitation({
      emailSender: sender,
      input: { ...context, email },
      pool,
    });
    await issueTeamInvitation({
      emailSender: sender,
      input: { ...context, email },
      pool,
    });
    const userId = await createTestUserWithEmail(email, "superseded");

    await expect(
      acceptTeamInvitation(pool, userId, first!.token),
    ).rejects.toThrow(/no longer valid/);
  });

  it("refuses the Organizer accepting their own Team invitation", async () => {
    const { auctionId, organizerId, teamId } = await setup("self");
    const email = (
      await pool.query<{ email: string }>(
        `select "email" from "user" where "id" = $1`,
        [organizerId],
      )
    ).rows[0]!.email;
    const { sender } = createCapturingSender();
    const issued = await issueTeamInvitation({
      emailSender: sender,
      input: { auctionId, email, organizerId, teamId },
      pool,
    });

    await expect(
      acceptTeamInvitation(pool, organizerId, issued!.token),
    ).rejects.toThrow(/Organizer/);
  });

  it("refuses a User who already represents another Team", async () => {
    const { auctionId, organizerId, teamId } = await setup("multi-team");
    const secondTeam = await createTeam(pool, organizerId, auctionId, {
      name: "Blues",
    });
    const email = uniqueTestEmail("multi");
    const userId = await createTestUserWithEmail(email, "multi");
    const { sender } = createCapturingSender();

    const first = await issueTeamInvitation({
      emailSender: sender,
      input: { auctionId, email, organizerId, teamId },
      pool,
    });
    await acceptTeamInvitation(pool, userId, first!.token);

    const second = await issueTeamInvitation({
      emailSender: sender,
      input: { auctionId, email, organizerId, teamId: secondTeam!.id },
      pool,
    });
    await expect(
      acceptTeamInvitation(pool, userId, second!.token),
    ).rejects.toThrow(/already represent/);
  });
});
