import { createPlayerEntry } from "@/server/auction-command/player-entries";
import { syncAuctionReadiness } from "@/server/auction-command/readiness";
import { assignPlayerRepresentative } from "@/server/auction-command/representatives";
import {
  saveSimpleRules,
  saveTieredRules,
} from "@/server/auction-command/rules";
import { startAuction } from "@/server/auction-command/start-auction";
import { createTeam } from "@/server/auction-command/teams";
import { assignPlayerTier, createTier } from "@/server/auction-command/tiers";
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
    timedCloseSeconds: number;
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
    timedCloseSeconds: 30,
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
    timedCloseSeconds: config.timedCloseSeconds,
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

export interface TieredLiveFixture {
  auctionId: string;
  bluesRepUserId: string;
  bluesTeamId: string;
  organizerId: string;
  /** Biddable Players in creation order, with their Tier. */
  players: { displayName: string; id: string; tierId: string }[];
  redsRepUserId: string;
  redsTeamId: string;
  revision: number;
  /** Tiers in order. */
  tiers: {
    id: string;
    label: string;
    maxPerTeam: number;
    minPerTeam: number;
    startingPrice: number;
  }[];
}

/**
 * A Live Tiered-Rules Auction with two Teams, two ordered Tiers, and two
 * biddable Players per Tier. Every Team's minimum is reachable exactly, so a
 * Tier can be completed and reoffered.
 */
export async function buildLiveTieredAuction(
  label: string,
  overrides: Partial<{
    bidIncrement: number;
    budget: number;
    closeMode: "manual" | "timed";
    goldMaxPerTeam: number;
    goldMinPerTeam: number;
    playersPerTier: number;
    rosterMax: number;
    rosterMin: number;
  }> = {},
): Promise<TieredLiveFixture> {
  const config = {
    bidIncrement: 5,
    budget: 200,
    closeMode: "manual" as const,
    goldMaxPerTeam: 2,
    goldMinPerTeam: 1,
    playersPerTier: 2,
    rosterMax: 3,
    rosterMin: 2,
    ...overrides,
  };

  const organizerId = await createTestUser(label);
  const auction = await createTestAuction(organizerId, {
    closeMode: config.closeMode,
    rulesMode: "tiered",
  });
  const auctionId = auction.id;

  const reds = await createTeam(pool, organizerId, auctionId, { name: "Reds" });
  const blues = await createTeam(pool, organizerId, auctionId, {
    name: "Blues",
  });

  const bronze = await createTier(pool, organizerId, auctionId, {
    label: "Bronze",
    maxPerTeam: 2,
    minPerTeam: 1,
    startingPrice: 10,
  });
  const gold = await createTier(pool, organizerId, auctionId, {
    label: "Gold",
    maxPerTeam: config.goldMaxPerTeam,
    minPerTeam: config.goldMinPerTeam,
    startingPrice: 20,
  });

  const players: TieredLiveFixture["players"] = [];
  for (const [tier, prefix] of [
    [bronze!, "Bronze"],
    [gold!, "Gold"],
  ] as const) {
    for (let index = 0; index < config.playersPerTier; index += 1) {
      const entry = await createPlayerEntry(pool, organizerId, auctionId, {
        displayName: `${prefix} ${index + 1}`,
      });
      await assignPlayerTier(pool, organizerId, auctionId, entry!.id, tier.id);
      players.push({
        displayName: entry!.displayName,
        id: entry!.id,
        tierId: tier.id,
      });
    }
  }

  const redRepPlayer = await createPlayerEntry(pool, organizerId, auctionId, {
    displayName: "Red Rep",
  });
  const blueRepPlayer = await createPlayerEntry(pool, organizerId, auctionId, {
    displayName: "Blue Rep",
  });

  const redsRepUserId = await registerRep(`${label}-rep-reds`);
  const bluesRepUserId = await registerRep(`${label}-rep-blues`);
  for (const [userId, playerEntryId, teamId] of [
    [redsRepUserId, redRepPlayer!.id, reds!.id],
    [bluesRepUserId, blueRepPlayer!.id, blues!.id],
  ] as const) {
    await assignPlayerRepresentative(pool, organizerId, auctionId, {
      email: (
        await pool.query<{ email: string }>(
          `select "email" from "user" where "id" = $1`,
          [userId],
        )
      ).rows[0]!.email,
      playerEntryId,
      teamId,
    });
  }

  await saveTieredRules(pool, organizerId, auctionId, {
    bidIncrement: config.bidIncrement,
    budget: config.budget,
    rosterMax: config.rosterMax,
    rosterMin: config.rosterMin,
  });

  await syncAuctionReadiness(pool, organizerId, auctionId);
  const started = await startAuction(pool, organizerId, auctionId);
  if (!started) throw new Error("Tiered fixture could not start the Auction.");

  return {
    auctionId,
    bluesRepUserId,
    bluesTeamId: blues!.id,
    organizerId,
    players,
    redsRepUserId,
    redsTeamId: reds!.id,
    revision: started.revision,
    tiers: [bronze!, gold!].map((tier) => ({
      id: tier.id,
      label: tier.label,
      maxPerTeam: tier.maxPerTeam,
      minPerTeam: tier.minPerTeam,
      startingPrice: tier.startingPrice,
    })),
  };
}
