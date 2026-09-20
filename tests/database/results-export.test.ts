import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  beginManualClose,
  finalizePresentation,
} from "@/server/auction-command/close-player";
import { pauseAuction } from "@/server/auction-command/lifecycle";
import { cancelLiveAuction } from "@/server/auction-command/paused-changes";
import { placeBid } from "@/server/auction-command/place-bid";
import { selectPlayer } from "@/server/auction-command/select-player";
import { getResultsForCaller } from "@/server/auction-query/results";
import {
  buildResultsCsv,
  buildResultsPdf,
  recordResultsExport,
} from "@/server/import-export/results-export";
import {
  cleanupTestUsers,
  createTestUser,
  pool,
  resetLiveAuctions,
} from "./support";
import { buildLiveAuction, type LiveFixture } from "./live-support";

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

const PHONES = {
  blueRep: "+880100000002",
  player1: "+880100000003",
  player2: "+880100000004",
  redRep: "+880100000001",
};

async function setPhone(playerEntryId: string, phone: string): Promise<void> {
  await pool.query(
    `update "player_entry" set "phone_number" = $2 where "id" = $1`,
    [playerEntryId, phone],
  );
}

/** Sells the first Player to the Red Team so its Roster holds two Players. */
async function sellFirstPlayerToReds(fixture: LiveFixture): Promise<void> {
  const selected = await selectPlayer(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
    playerEntryId: fixture.players[0]!.id,
    selectionMethod: "manual",
  });
  if (selected.status !== "accepted") throw new Error("selection failed");
  const presentationId = selected.result.presentationId;

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
  const finalized = await finalizePresentation(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    presentationId,
  });
  if (finalized.status !== "accepted") throw new Error("sale failed");
}

/** A Live Auction with phone numbers on every Player Entry. */
async function fixtureWithPhones(label: string): Promise<LiveFixture> {
  const fixture = await buildLiveAuction(label);
  const reps = await pool.query<{ id: string; team_id: string }>(
    `select pe."id", pe."team_id" from "player_entry" pe
      where pe."auction_id" = $1 and pe."is_representative"`,
    [fixture.auctionId],
  );
  for (const rep of reps.rows) {
    await setPhone(
      rep.id,
      rep.team_id === fixture.redsTeamId ? PHONES.redRep : PHONES.blueRep,
    );
  }
  await setPhone(fixture.players[0]!.id, PHONES.player1);
  await setPhone(fixture.players[1]!.id, PHONES.player2);
  return fixture;
}

async function cancel(fixture: LiveFixture): Promise<void> {
  await pauseAuction(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
  });
  const cancelled = await cancelLiveAuction(pool, {
    actorUserId: fixture.organizerId,
    auctionId: fixture.auctionId,
    commandId: commandId(),
    expectedRevision: await revision(fixture.auctionId),
    reason: "Ended early",
  });
  if (cancelled.status !== "accepted") throw new Error("cancel failed");
}

describe("getResultsForCaller", () => {
  it("hides Results from an unrelated User and from an Auction still in setup", async () => {
    const fixture = await fixtureWithPhones("results-authorization");
    const stranger = await createTestUser("results-stranger");
    expect(
      await getResultsForCaller(pool, stranger, fixture.auctionId),
    ).toBeNull();

    const draft = await pool.query<{ id: string }>(
      `insert into "auction" ("organizer_id", "title", "game", "rules_mode", "close_mode", "status")
       values ($1, 'Draft', 'Chess', 'simple', 'manual', 'draft')
       returning "id"`,
      [fixture.organizerId],
    );
    expect(
      await getResultsForCaller(pool, fixture.organizerId, draft.rows[0]!.id),
    ).toBeNull();
  });

  it("shows every phone number to participants while Live and narrows a Representative afterwards", async () => {
    const fixture = await fixtureWithPhones("results-phones");
    await sellFirstPlayerToReds(fixture);

    // Live: a Representative may inspect the whole Player pool.
    const liveRep = await getResultsForCaller(
      pool,
      fixture.bluesRepUserId,
      fixture.auctionId,
    );
    expect(liveRep?.phase).toBe("live");
    expect(liveRep?.includesPhoneNumbers).toBe(true);
    expect(
      liveRep!.contacts.find((c) => c.playerEntryId === fixture.players[1]!.id)
        ?.phoneNumber,
    ).toBe(PHONES.player2);

    const organizer = await getResultsForCaller(
      pool,
      fixture.organizerId,
      fixture.auctionId,
    );
    expect(organizer?.includesPhoneNumbers).toBe(true);

    await cancel(fixture);

    // Closed: a Representative keeps only its own Roster's numbers, and the
    // withheld ones are absent from the payload entirely.
    const closedReds = await getResultsForCaller(
      pool,
      fixture.redsRepUserId,
      fixture.auctionId,
    );
    expect(closedReds?.phase).toBe("closed");
    const redsContacts = closedReds!.contacts;
    expect(
      redsContacts.find(
        (c) => c.teamId === fixture.redsTeamId && !c.isRepresentative,
      )?.phoneNumber,
    ).toBe(PHONES.player1);
    const withheld = redsContacts.find(
      (c) => c.playerEntryId === fixture.players[1]!.id,
    )!;
    expect(withheld.phoneNumber).toBeNull();
    expect(withheld.phoneWithheld).toBe(true);
    expect(JSON.stringify(closedReds)).not.toContain(
      PHONES.player2.substring(1),
    );

    // The Blues Team rows carry no Red phone numbers, and the Blues
    // Representative's own Roster number is withheld from a Reds viewer.
    const bluesTeamRow = closedReds!.results.teams.find(
      (team) => team.id === fixture.bluesTeamId,
    )!;
    const bluesJson = JSON.stringify(bluesTeamRow);
    expect(bluesJson).not.toContain(PHONES.redRep.substring(1));
    expect(bluesJson).not.toContain(PHONES.player1.substring(1));
    expect(bluesJson).not.toContain(PHONES.blueRep.substring(1));
    const redsTeamRow = closedReds!.results.teams.find(
      (team) => team.id === fixture.redsTeamId,
    )!;
    expect(JSON.stringify(redsTeamRow)).toContain(PHONES.redRep);

    // The Organizer still sees everything after the Auction closes.
    const closedOrganizer = await getResultsForCaller(
      pool,
      fixture.organizerId,
      fixture.auctionId,
    );
    expect(
      closedOrganizer!.contacts.find(
        (c) => c.playerEntryId === fixture.players[1]!.id,
      )?.phoneNumber,
    ).toBe(PHONES.player2);
  });

  it("reports Rosters, spend, and Tier counts for a closed Auction", async () => {
    const fixture = await fixtureWithPhones("results-summary");
    await sellFirstPlayerToReds(fixture);
    await cancel(fixture);

    const view = await getResultsForCaller(
      pool,
      fixture.organizerId,
      fixture.auctionId,
    );
    expect(view).not.toBeNull();
    const reds = view!.results.teams.find(
      (team) => team.id === fixture.redsTeamId,
    )!;
    expect(reds.rosterCount).toBe(2);
    expect(reds.spentCredits).toBe(10);
    expect(reds.remainingBudget).toBe(90);
    expect(reds.players.map((player) => player.source).sort()).toEqual([
      "bid",
      "representative",
    ]);
  });
});

describe("Results exports", () => {
  it("filters CSV phone numbers by role and never puts a phone number in a PDF", async () => {
    const fixture = await fixtureWithPhones("results-exports");
    await sellFirstPlayerToReds(fixture);
    await cancel(fixture);

    const organizerView = (await getResultsForCaller(
      pool,
      fixture.organizerId,
      fixture.auctionId,
    ))!;
    const organizerCsv = buildResultsCsv(organizerView);
    for (const phone of Object.values(PHONES)) {
      expect(organizerCsv.csv).toContain(phone.substring(1));
    }
    expect(organizerCsv.phoneNumberCount).toBe(4);

    const repView = (await getResultsForCaller(
      pool,
      fixture.redsRepUserId,
      fixture.auctionId,
    ))!;
    const repCsv = buildResultsCsv(repView);
    expect(repCsv.csv).toContain(PHONES.redRep.substring(1));
    expect(repCsv.csv).toContain(PHONES.player1.substring(1));
    expect(repCsv.csv).not.toContain(PHONES.player2.substring(1));
    expect(repCsv.csv).not.toContain(PHONES.blueRep.substring(1));
    expect(repCsv.phoneNumberCount).toBe(2);

    for (const view of [organizerView, repView]) {
      const pdfText = buildResultsPdf(view).pdf.toString("latin1");
      for (const phone of Object.values(PHONES)) {
        expect(pdfText).not.toContain(phone.substring(1));
      }
      expect(pdfText).toContain("Reds");
    }
  });

  it("records an export audit entry without a phone number in its details", async () => {
    const fixture = await fixtureWithPhones("results-audit");
    await cancel(fixture);

    const view = (await getResultsForCaller(
      pool,
      fixture.organizerId,
      fixture.auctionId,
    ))!;
    const exported = buildResultsCsv(view);
    await recordResultsExport(pool, {
      actorUserId: fixture.organizerId,
      auctionId: fixture.auctionId,
      format: "csv",
      phoneNumberCount: exported.phoneNumberCount,
      rowCount: exported.rowCount,
      viewerRole: view.viewerRole,
    });

    const audit = await pool.query<{ details: Record<string, unknown> }>(
      `select "details" from "audit_entry"
        where "auction_id" = $1 and "action" = 'export_results'`,
      [fixture.auctionId],
    );
    expect(audit.rows).toHaveLength(1);
    const details = JSON.stringify(audit.rows[0]!.details);
    expect(details).toContain("phoneNumberCount");
    for (const phone of Object.values(PHONES)) {
      expect(details).not.toContain(phone);
    }
  });
});
