import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { AdministrationError } from "@/domain/administration";
import {
  bootstrapAdministrator,
  hideAuction,
  recordModerationInspection,
  restoreUser,
  revokeUserSessions,
  suspendUser,
  unhideAuction,
} from "@/server/auction-command/administration";
import { createDraftAuction } from "@/server/auction-command/auction-command";
import { createPlayerEntry } from "@/server/auction-command/player-entries";
import { getOrganizerAuctions } from "@/server/auction-query/auction-query";
import {
  isPlatformAdministrator,
  isUserSuspended,
  loadModerationSummary,
} from "@/server/auction-query/administration";
import { isEditableAuction } from "@/server/auction-query/editable";
import { getLiveSnapshot } from "@/server/auction-query/live-snapshot";
import { getResultsForCaller } from "@/server/auction-query/results";
import { grantRealtimeAccess } from "@/server/realtime/grant";
import {
  cleanupTestUsers,
  createTestAuction,
  createTestUser,
  pool,
  resetLiveAuctions,
} from "./support";
import { buildLiveAuction } from "./live-support";

afterAll(cleanupTestUsers);
beforeEach(async () => {
  await cleanupTestUsers();
  // Moderation history is intentionally immutable and survives a deleted User,
  // so this file sweeps records left by earlier runs whose actor is gone.
  await pool.query(
    `delete from "moderation_access_entry" where "actor_user_id" is null`,
  );
  // Browser specs leave synthetic administrators behind. Bootstrap refuses to
  // run while any administrator exists, so clear the synthetic ones only — a
  // real operator's administrator is never touched.
  await pool.query(
    `delete from "platform_administrator" pa
       using "user" u
      where u."id" = pa."user_id" and u."email" like $1`,
    ["browser-%"],
  );
  await resetLiveAuctions();
});
afterEach(resetLiveAuctions);

async function grantAdministrator(userId: string): Promise<void> {
  await pool.query(
    `insert into "platform_administrator" ("user_id") values ($1)`,
    [userId],
  );
}

async function moderationRecords(
  actorUserId: string,
  auctionId: null | string = null,
): Promise<{ action: string; reason: string }[]> {
  const result = await pool.query<{ action: string; reason: string }>(
    `select "action", "reason" from "moderation_access_entry"
      where "actor_user_id" = $1
        and ($2::uuid is null or "auction_id" = $2)
      order by "id" asc`,
    [actorUserId, auctionId],
  );
  return result.rows;
}

describe("administrator authorization", () => {
  it("refuses every moderation action for a non-administrator", async () => {
    const stranger = await createTestUser("admin-stranger");
    const target = await createTestUser("admin-target");
    const auction = await createTestAuction(stranger);

    expect(await isPlatformAdministrator(pool, stranger)).toBe(false);
    expect(
      await suspendUser(pool, stranger, { reason: "Nope", userId: target }),
    ).toBeNull();
    expect(
      await hideAuction(pool, stranger, {
        auctionId: auction.id,
        reason: "Nope",
      }),
    ).toBeNull();
    expect(
      await recordModerationInspection(pool, stranger, {
        auctionId: auction.id,
        reason: "Nope",
      }),
    ).toBeNull();
    expect(
      await restoreUser(pool, stranger, { reason: "Nope", userId: target }),
    ).toBeNull();
    expect(
      await revokeUserSessions(pool, stranger, {
        reason: "Nope",
        userId: target,
      }),
    ).toBeNull();
    expect(await moderationRecords(stranger)).toHaveLength(0);
  });
});

describe("suspension", () => {
  it("suspends a User, revokes their sessions, and records the action", async () => {
    const admin = await createTestUser("admin-suspend");
    await grantAdministrator(admin);
    const target = await createTestUser("admin-suspend-target");
    await pool.query(
      `insert into "session" ("id", "expiresAt", "token", "updatedAt", "userId")
       values ($1, now() + interval '1 day', $2, now(), $3)`,
      [randomUUID(), randomUUID(), target],
    );

    const outcome = await suspendUser(pool, admin, {
      reason: "Abusive messages",
      userId: target,
    });
    expect(outcome).toMatchObject({ action: "suspend_user" });
    expect(await isUserSuspended(pool, target)).toBe(true);

    const sessions = await pool.query<{ count: number }>(
      `select count(*)::int as count from "session" where "userId" = $1`,
      [target],
    );
    expect(sessions.rows[0]!.count).toBe(0);

    expect(await moderationRecords(admin)).toEqual([
      { action: "suspend_user", reason: "Abusive messages" },
    ]);

    await expect(
      suspendUser(pool, admin, { reason: "Again", userId: target }),
    ).rejects.toBeInstanceOf(AdministrationError);

    // Restoring lifts the suspension but keeps the record.
    await restoreUser(pool, admin, { reason: "Appeal upheld", userId: target });
    expect(await isUserSuspended(pool, target)).toBe(false);
    expect(
      (await moderationRecords(admin)).map((record) => record.action),
    ).toEqual(["suspend_user", "restore_user"]);
  });

  it("revokes sessions without suspending the User", async () => {
    const admin = await createTestUser("admin-revoke");
    await grantAdministrator(admin);
    const target = await createTestUser("admin-revoke-target");
    await pool.query(
      `insert into "session" ("id", "expiresAt", "token", "updatedAt", "userId")
       values ($1, now() + interval '1 day', $2, now(), $3)`,
      [randomUUID(), randomUUID(), target],
    );

    const outcome = await revokeUserSessions(pool, admin, {
      reason: "Lost device",
      userId: target,
    });
    expect(outcome?.revokedCount).toBe(1);
    expect(await isUserSuspended(pool, target)).toBe(false);
  });
});

describe("hiding an Auction", () => {
  it("removes access while keeping every domain record intact", async () => {
    const admin = await createTestUser("admin-hide");
    await grantAdministrator(admin);
    const organizerId = await createTestUser("admin-hide-organizer");
    const auction = await createTestAuction(organizerId);
    await createPlayerEntry(pool, organizerId, auction.id, {
      displayName: "Alice",
    });

    const before = await loadModerationSummary(pool, auction.id);

    await hideAuction(pool, admin, {
      auctionId: auction.id,
      reason: "Prohibited content",
    });

    // The Auction is unavailable to its Organizer...
    expect(await isEditableAuction(pool, organizerId, auction.id)).toBe(false);
    expect(
      (await getOrganizerAuctions(pool, organizerId)).some(
        (row) => row.id === auction.id,
      ),
    ).toBe(false);

    // ...but nothing about its content changed.
    const after = await loadModerationSummary(pool, auction.id);
    expect(after?.auction.hidden).toBe(true);
    expect(after?.counts).toEqual(before?.counts);
    expect(after?.auction.revision).toBe(before?.auction.revision);
    expect(
      await createPlayerEntry(pool, organizerId, auction.id, {
        displayName: "Late",
      }),
    ).toBeNull();

    await unhideAuction(pool, admin, {
      auctionId: auction.id,
      reason: "Restored after review",
    });
    expect(await isEditableAuction(pool, organizerId, auction.id)).toBe(true);
    expect(
      (await moderationRecords(admin, auction.id)).map(
        (record) => record.action,
      ),
    ).toEqual(["hide_auction", "unhide_auction"]);
  });

  it("hides a Live Auction from its Organizer and Representatives", async () => {
    const admin = await createTestUser("admin-hide-live");
    await grantAdministrator(admin);
    const fixture = await buildLiveAuction("admin-hide-live");

    expect(
      await getLiveSnapshot(pool, fixture.organizerId, fixture.auctionId),
    ).not.toBeNull();
    expect(
      await getResultsForCaller(pool, fixture.redsRepUserId, fixture.auctionId),
    ).not.toBeNull();

    await hideAuction(pool, admin, {
      auctionId: fixture.auctionId,
      reason: "Reported content",
    });

    expect(
      await getLiveSnapshot(pool, fixture.organizerId, fixture.auctionId),
    ).toBeNull();
    expect(
      await getLiveSnapshot(pool, fixture.bluesRepUserId, fixture.auctionId),
    ).toBeNull();
    expect(
      await getResultsForCaller(pool, fixture.organizerId, fixture.auctionId),
    ).toBeNull();
    expect(
      await grantRealtimeAccess(pool, fixture.redsRepUserId, fixture.auctionId),
    ).toBeNull();
  });
});

describe("recorded inspection and bootstrap", () => {
  it("records the reason before any summary is read", async () => {
    const admin = await createTestUser("admin-inspect");
    await grantAdministrator(admin);
    const organizerId = await createTestUser("admin-inspect-organizer");
    const auction = await createTestAuction(organizerId);

    await recordModerationInspection(pool, admin, {
      auctionId: auction.id,
      reason: "User report",
    });

    const records = await moderationRecords(admin, auction.id);
    expect(records).toEqual([
      { action: "inspect_auction", reason: "User report" },
    ]);

    await expect(
      recordModerationInspection(pool, admin, {
        auctionId: auction.id,
        reason: "   ",
      }),
    ).rejects.toThrow();
  });

  it("provisions only the first administrator and never a second", async () => {
    const first = await createTestUser("admin-bootstrap-first");
    const second = await createTestUser("admin-bootstrap-second");

    const provisioned = await bootstrapAdministrator(pool, { userId: first });
    expect(provisioned.action).toBe("bootstrap_administrator");
    expect(await isPlatformAdministrator(pool, first)).toBe(true);

    await expect(
      bootstrapAdministrator(pool, { userId: second }),
    ).rejects.toBeInstanceOf(AdministrationError);
    expect(await isPlatformAdministrator(pool, second)).toBe(false);
  });

  it("does not mix administrator authority with Auction ownership", async () => {
    const admin = await createTestUser("admin-owner");
    await grantAdministrator(admin);

    const auction = await createDraftAuction(pool, admin, {
      closeMode: "manual",
      game: "Chess",
      rulesMode: "simple",
      title: "Organizer Auction",
    });
    const owned = await getOrganizerAuctions(pool, admin);
    expect(owned.some((row) => row.id === auction.id)).toBe(true);
    // Administrator status grants no Auction control: the Organizer path is the
    // only one that can edit this Auction.
    expect(await isEditableAuction(pool, admin, auction.id)).toBe(true);
  });
});
