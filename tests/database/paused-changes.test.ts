import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  beginManualClose,
  finalizePresentation,
} from "@/server/auction-command/close-player";
import {
  pauseAuction,
  resumeAuction,
} from "@/server/auction-command/lifecycle";
import { placeBid } from "@/server/auction-command/place-bid";
import {
  addPausedPlayerEntries,
  cancelLiveAuction,
  changePausedConstraints,
  increaseTeamBudgets,
  replaceTeamRepresentative,
  transferOwnership,
} from "@/server/auction-command/paused-changes";
import { selectPlayer } from "@/server/auction-command/select-player";
import { grantRealtimeAccess } from "@/server/realtime/grant";
import {
  cleanupTestUsers,
  createTestUser,
  pool,
  resetLiveAuctions,
} from "./support";
import {
  buildLiveAuction,
  buildLiveTieredAuction,
  type LiveFixture,
} from "./live-support";

afterAll(cleanupTestUsers);

beforeEach(resetLiveAuctions);
afterEach(resetLiveAuctions);

function commandId(): string {
  return randomUUID();
}

async function revision(auctionId: string): Promise<number> {
  const result = await pool.query<{ revision: number }>(
    `select "revision" from "auction" where "id" = $1`,
    [auctionId],
  );
  return result.rows[0]!.revision;
}

async function status(auctionId: string): Promise<string> {
  const result = await pool.query<{ status: string }>(
    `select "status" from "auction" where "id" = $1`,
    [auctionId],
  );
  return result.rows[0]!.status;
}

async function emailOf(userId: string): Promise<string> {
  const result = await pool.query<{ email: string }>(
    `select "email" from "user" where "id" = $1`,
    [userId],
  );
  return result.rows[0]!.email;
}

/** A registered, verified User with no role in the Auction. */
async function eligibleUser(
  label: string,
): Promise<{ email: string; id: string }> {
  const id = await createTestUser(label);
  return { email: await emailOf(id), id };
}

async function pause(fixture: LiveFixture): Promise<void> {
  const outcome = await pauseAuction(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
  });
  if (outcome.status !== "accepted") {
    throw new Error(`pause failed: ${JSON.stringify(outcome)}`);
  }
}

async function present(fixture: LiveFixture, index = 0): Promise<string> {
  const outcome = await selectPlayer(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
    playerEntryId: fixture.players[index]!.id,
    selectionMethod: "manual",
  });
  if (outcome.status !== "accepted") {
    throw new Error(`selection failed: ${JSON.stringify(outcome)}`);
  }
  return outcome.result.presentationId;
}

/** Sells the first Player to the Red Team so its Roster holds two Players. */
async function sellFirstPlayerToReds(fixture: LiveFixture): Promise<void> {
  const presentationId = await present(fixture);
  await placeBid(pool, {
    actorUserId: fixture.redsRepUserId,
    amount: 10,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
    presentationId,
    teamId: fixture.redsTeamId,
  });
  await beginManualClose(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
    presentationId,
  });
  await pool.query(
    `update "player_presentation"
        set "warning_deadline" = now() - interval '1 second'
      where "id" = $1`,
    [presentationId],
  );
  const outcome = await finalizePresentation(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    presentationId,
  });
  if (outcome.status !== "accepted") {
    throw new Error(`sale failed: ${JSON.stringify(outcome)}`);
  }
}

async function auditCount(auctionId: string, action: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from "audit_entry"
      where "auction_id" = $1 and "action" = $2`,
    [auctionId, action],
  );
  return result.rows[0]!.count;
}

describe("replaceTeamRepresentative", () => {
  it("gives the replacement authority and strips the former representative", async () => {
    const fixture = await buildLiveAuction("replace-authority");
    await pause(fixture);
    const replacement = await eligibleUser("replace-authority-new");

    expect(
      await grantRealtimeAccess(pool, fixture.redsRepUserId, fixture.auctionId),
    ).not.toBeNull();

    const outcome = await replaceTeamRepresentative(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      email: replacement.email,
      expectedRevision: await revision(fixture.auctionId),
      playerEntryId: null,
      reason: "Personnel change",
      teamId: fixture.redsTeamId,
    });
    expect(outcome.status).toBe("accepted");

    // The former Representative loses subscription authority immediately.
    expect(
      await grantRealtimeAccess(pool, fixture.redsRepUserId, fixture.auctionId),
    ).toBeNull();
    expect(
      await grantRealtimeAccess(pool, replacement.id, fixture.auctionId),
    ).not.toBeNull();

    await resumeAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    const presentationId = await present(fixture);

    const former = await placeBid(pool, {
      actorUserId: fixture.redsRepUserId,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });
    expect(former).toMatchObject({
      reason: "not_representative",
      status: "rejected",
    });

    const current = await placeBid(pool, {
      actorUserId: replacement.id,
      amount: 10,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      presentationId,
      teamId: fixture.redsTeamId,
    });
    expect(current.status).toBe("accepted");
  });

  it("applies the one-Team-per-User and Organizer separation rules", async () => {
    const fixture = await buildLiveAuction("replace-rules");
    await pause(fixture);

    const otherTeamEmail = await emailOf(fixture.bluesRepUserId);
    expect(
      await replaceTeamRepresentative(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        email: otherTeamEmail,
        expectedRevision: await revision(fixture.auctionId),
        playerEntryId: null,
        reason: "Conflict",
        teamId: fixture.redsTeamId,
      }),
    ).toMatchObject({ reason: "user_already_represents" });

    const organizerEmail = await emailOf(fixture.organizerId);
    expect(
      await replaceTeamRepresentative(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        email: organizerEmail,
        expectedRevision: await revision(fixture.auctionId),
        playerEntryId: null,
        reason: "Self",
        teamId: fixture.redsTeamId,
      }),
    ).toMatchObject({ reason: "organizer_cannot_represent" });

    expect(
      await replaceTeamRepresentative(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        email: "nobody-registered@example.com",
        expectedRevision: await revision(fixture.auctionId),
        playerEntryId: null,
        reason: "Unknown",
        teamId: fixture.redsTeamId,
      }),
    ).toMatchObject({ reason: "representative_not_registered" });
  });
});

describe("transferOwnership", () => {
  it("transfers to an eligible User and refuses a User who represents a Team", async () => {
    const fixture = await buildLiveAuction("transfer-ownership");
    await pause(fixture);

    expect(
      await transferOwnership(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        email: await emailOf(fixture.redsRepUserId),
        expectedRevision: await revision(fixture.auctionId),
        reason: "Handover",
      }),
    ).toMatchObject({ reason: "user_belongs_to_auction" });

    const successor = await eligibleUser("transfer-ownership-new");
    const outcome = await transferOwnership(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      email: successor.email,
      expectedRevision: await revision(fixture.auctionId),
      reason: "Handover",
    });
    expect(outcome.status).toBe("accepted");

    const auction = await pool.query<{ organizer_id: string }>(
      `select "organizer_id" from "auction" where "id" = $1`,
      [fixture.auctionId],
    );
    expect(auction.rows[0]!.organizer_id).toBe(successor.id);

    // The former Organizer can no longer make controlled changes.
    expect(
      await increaseTeamBudgets(pool, {
        actorUserId: fixture.organizerId,
        amount: 10,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        reason: "Not mine",
      }),
    ).toMatchObject({ status: "unauthorized" });
    expect(await auditCount(fixture.auctionId, "transfer_ownership")).toBe(1);
  });
});

describe("increaseTeamBudgets", () => {
  it("increases every Team's Budget equally and only while Paused", async () => {
    const fixture = await buildLiveAuction("increase-budget");

    expect(
      await increaseTeamBudgets(pool, {
        actorUserId: fixture.organizerId,
        amount: 25,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        reason: "Too early",
      }),
    ).toMatchObject({ reason: "auction_not_paused" });

    await pause(fixture);
    const before = await revision(fixture.auctionId);
    const outcome = await increaseTeamBudgets(pool, {
      actorUserId: fixture.organizerId,
      amount: 25,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: before,
      reason: "Planning mistake",
    });
    expect(outcome.status).toBe("accepted");
    expect(await revision(fixture.auctionId)).toBe(before + 1);

    const rules = await pool.query<{ budget: number }>(
      `select "budget" from "auction_rule_set" where "auction_id" = $1`,
      [fixture.auctionId],
    );
    expect(rules.rows[0]!.budget).toBe(125);
    expect(await auditCount(fixture.auctionId, "increase_budget")).toBe(1);

    const announcement = await pool.query<{
      payload: { announcement: string };
    }>(
      `select "payload" from "auction_outbox_event"
        where "auction_id" = $1 and "kind" = 'increase_budget'`,
      [fixture.auctionId],
    );
    expect(announcement.rows[0]!.payload.announcement).toContain("125");
  });
});

describe("addPausedPlayerEntries", () => {
  it("adds Players only to an unopened Tier under Tiered Rules", async () => {
    const fixture = await buildLiveTieredAuction("add-players");
    await pause(fixture);
    const [bronze, gold] = fixture.tiers;

    // Bronze is the Active Tier but no Player in it has been offered yet.
    const early = await addPausedPlayerEntries(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      players: [{ displayName: "Late Bronze", tierId: bronze!.id }],
      reason: "Missed entry",
    });
    expect(early.status).toBe("accepted");

    // Offering a Bronze Player opens that Tier to nothing more.
    await resumeAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
    });
    await selectPlayer(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      playerEntryId: fixture.players[0]!.id,
      selectionMethod: "manual",
    });
    await pause(fixture);

    expect(
      await addPausedPlayerEntries(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        players: [{ displayName: "Too Late", tierId: bronze!.id }],
        reason: "Too late",
      }),
    ).toMatchObject({ reason: "tier_already_opened" });

    const laterTier = await addPausedPlayerEntries(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      players: [{ displayName: "Late Gold", tierId: gold!.id }],
      reason: "Planned",
    });
    expect(laterTier.status).toBe("accepted");
    expect(await auditCount(fixture.auctionId, "add_players")).toBe(2);

    // No Starting Price can be supplied once bidding has begun.
    const entries = await pool.query<{ count: number }>(
      `select count(*)::int as count from "player_entry"
        where "auction_id" = $1 and "starting_price_override" is not null`,
      [fixture.auctionId],
    );
    expect(entries.rows[0]!.count).toBe(0);
  });

  it("refuses a Tier for a Simple-Rules Auction and is Paused-only", async () => {
    const fixture = await buildLiveAuction("add-players-simple");
    const tier = randomUUID();

    expect(
      await addPausedPlayerEntries(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        players: [{ displayName: "No Tier", tierId: tier }],
        reason: "Live",
      }),
    ).toMatchObject({ reason: "auction_not_paused" });

    await pause(fixture);
    expect(
      await addPausedPlayerEntries(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        players: [{ displayName: "No Tier", tierId: tier }],
        reason: "Bad tier",
      }),
    ).toMatchObject({ reason: "tier_not_in_auction" });

    const added = await addPausedPlayerEntries(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      players: [
        { displayName: "Late Player", phoneNumber: "+880 1700 000000" },
      ],
      reason: "Missed entry",
    });
    expect(added.status).toBe("accepted");
  });
});

describe("changePausedConstraints", () => {
  it("refuses a maximum below a Team's current count and a change with no Legal Completion", async () => {
    const fixture = await buildLiveAuction("constraints-guards");
    await sellFirstPlayerToReds(fixture);
    await pause(fixture);

    expect(
      await changePausedConstraints(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        reason: "Too low",
        rosterMax: "1",
        rosterMin: "1",
        tiers: [],
      }),
    ).toMatchObject({ reason: "maximum_below_current_count" });
    expect(await auditCount(fixture.auctionId, "change_constraints")).toBe(0);
  });

  it("refuses constraints that leave no Legal Completion and accepts a safe change", async () => {
    const fixture = await buildLiveTieredAuction("constraints-tiered");
    await pause(fixture);
    const [bronze, gold] = fixture.tiers;

    // Each Team needs one Bronze Player and only two Bronze Players exist.
    expect(
      await changePausedConstraints(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        reason: "Impossible minimum",
        rosterMax: "3",
        rosterMin: "2",
        tiers: [
          { maxPerTeam: 2, minPerTeam: 2, tierId: bronze!.id },
          { maxPerTeam: 2, minPerTeam: 1, tierId: gold!.id },
        ],
      }),
    ).toMatchObject({ reason: "no_legal_completion" });
    expect(await auditCount(fixture.auctionId, "change_constraints")).toBe(0);

    const before = await revision(fixture.auctionId);
    const outcome = await changePausedConstraints(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: before,
      reason: "Raise capacity",
      rosterMax: "3",
      rosterMin: "2",
      tiers: [
        { maxPerTeam: 2, minPerTeam: 1, tierId: bronze!.id },
        { maxPerTeam: 2, minPerTeam: 1, tierId: gold!.id },
      ],
    });
    expect(outcome.status).toBe("accepted");
    expect(await revision(fixture.auctionId)).toBe(before + 1);
    expect(await auditCount(fixture.auctionId, "change_constraints")).toBe(1);
  });
});

describe("cancelLiveAuction", () => {
  it("cancels only while Paused and refuses every later command", async () => {
    const fixture = await buildLiveAuction("cancel-auction");
    const presentationId = await present(fixture);

    expect(
      await cancelLiveAuction(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        reason: "Too early",
      }),
    ).toMatchObject({ reason: "auction_not_paused" });

    await pause(fixture);
    const outcome = await cancelLiveAuction(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      commandId: commandId(),
      expectedRevision: await revision(fixture.auctionId),
      reason: "Called off",
    });
    expect(outcome.status).toBe("accepted");
    expect(await status(fixture.auctionId)).toBe("cancelled");

    // The Auction is permanently read-only.
    expect(
      await resumeAuction(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
      }),
    ).toMatchObject({ reason: "not_paused" });
    expect(
      await selectPlayer(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        playerEntryId: fixture.players[0]!.id,
        selectionMethod: "manual",
      }),
    ).toMatchObject({ reason: "auction_not_live" });
    expect(
      await cancelLiveAuction(pool, {
        actorUserId: fixture.organizerId,
        auctionId: fixture.auctionId,
        commandId: commandId(),
        expectedRevision: await revision(fixture.auctionId),
        reason: "Again",
      }),
    ).toMatchObject({ reason: "auction_cancelled" });

    // The Active Player is closed as returned, never sold.
    const presentation = await pool.query<{ state: string }>(
      `select "state" from "player_presentation" where "id" = $1`,
      [presentationId],
    );
    expect(presentation.rows[0]!.state).toBe("returned");
    const sales = await pool.query<{ count: number }>(
      `select count(*)::int as count from "sale" where "auction_id" = $1`,
      [fixture.auctionId],
    );
    expect(sales.rows[0]!.count).toBe(0);
    expect(await auditCount(fixture.auctionId, "cancel_auction")).toBe(1);
  });
});
