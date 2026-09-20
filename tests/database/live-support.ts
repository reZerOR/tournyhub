import { createPlayerEntry } from "@/server/auction-command/player-entries";
import { syncAuctionReadiness } from "@/server/auction-command/readiness";
import { assignPlayerRepresentative } from "@/server/auction-command/representatives";
import { saveSimpleRules } from "@/server/auction-command/rules";
import { startAuction } from "@/server/auction-command/start-auction";
import { createTeam } from "@/server/auction-command/teams";
import {
  createTestAuction,
  createTestUser,
  createTestUserWithEmail,
  pool,
  uniqueTestEmail,
} from "./support";

export interface LiveFixture {
  auctionId: string;
  bluesRepUserId: string;
  bluesTeamId: string;
  organizerId: string;
  /** Biddable Players in creation order. */
  players: { displayName: string; id: string }[];
  redsRepUserId: string;
  redsTeamId: string;
  revision: number;
}

async function registerRep(label: string): Promise<string> {
  const email = uniqueTestEmail(label);
  await createTestUserWithEmail(email, label);
  const result = await pool.query<{ id: string }>(
    `select "id" from "user" where "email" = $1`,
    [email],
  );
  return result.rows[0]!.id;
}

/**
 * A Live Simple-Rules Auction with two named Teams, a Player Representative
 * each, four biddable Players, and a Legal Completion. Bids start at the
 * default Starting Price of 10 with a Bid Increment of 5.
 */
export async function buildLiveAuction(
  label: string,
  overrides: Partial<{
    bidIncrement: number;
    budget: number;
    closeMode: "manual" | "timed";
    defaultStartingPrice: number;
    playerCount: number;
    rosterMax: number;
    rosterMin: number;
  }> = {},
): Promise<LiveFixture> {
  const config = {
    bidIncrement: 5,
    budget: 100,
    closeMode: "manual" as const,
    defaultStartingPrice: 10,
    playerCount: 4,
    rosterMax: 3,
    rosterMin: 2,
    ...overrides,
  };

  const organizerId = await createTestUser(label);
  const auction = await createTestAuction(organizerId, {
    closeMode: config.closeMode,
  });
  const auctionId = auction.id;

  const reds = await createTeam(pool, organizerId, auctionId, { name: "Reds" });
  const blues = await createTeam(pool, organizerId, auctionId, {
    name: "Blues",
  });

  const redRepPlayer = await createPlayerEntry(pool, organizerId, auctionId, {
    displayName: "Red Rep",
  });
  const blueRepPlayer = await createPlayerEntry(pool, organizerId, auctionId, {
    displayName: "Blue Rep",
  });

  const players: { displayName: string; id: string }[] = [];
  for (let index = 0; index < config.playerCount; index += 1) {
    const entry = await createPlayerEntry(pool, organizerId, auctionId, {
      displayName: `Player ${index + 1}`,
    });
    players.push({ displayName: entry!.displayName, id: entry!.id });
  }

  const redsRepUserId = await registerRep(`${label}-rep-reds`);
  const bluesRepUserId = await registerRep(`${label}-rep-blues`);
  await assignPlayerRepresentative(pool, organizerId, auctionId, {
    email: (
      await pool.query<{ email: string }>(
        `select "email" from "user" where "id" = $1`,
        [redsRepUserId],
      )
    ).rows[0]!.email,
    playerEntryId: redRepPlayer!.id,
    teamId: reds!.id,
  });
  await assignPlayerRepresentative(pool, organizerId, auctionId, {
    email: (
      await pool.query<{ email: string }>(
        `select "email" from "user" where "id" = $1`,
        [bluesRepUserId],
      )
    ).rows[0]!.email,
    playerEntryId: blueRepPlayer!.id,
    teamId: blues!.id,
  });

  await saveSimpleRules(pool, organizerId, auctionId, {
    bidIncrement: config.bidIncrement,
    budget: config.budget,
    defaultStartingPrice: config.defaultStartingPrice,
    rosterMax: config.rosterMax,
    rosterMin: config.rosterMin,
  });

  await syncAuctionReadiness(pool, organizerId, auctionId);
  const started = await startAuction(pool, organizerId, auctionId);
  if (!started) throw new Error("Live fixture could not start the Auction.");

  return {
    auctionId,
    bluesRepUserId,
    bluesTeamId: blues!.id,
    organizerId,
    players,
    redsRepUserId,
    redsTeamId: reds!.id,
    revision: started.revision,
  };
}
