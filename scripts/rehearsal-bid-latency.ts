import { randomUUID } from "node:crypto";

import nextEnv from "@next/env";

/**
 * The 40-tab Bid latency rehearsal.
 *
 * It creates a synthetic Live Auction with the real Auction Command module,
 * stands up the requested number of representative "tabs", and measures the
 * server-observed response time of each Bid from receipt through the committed
 * response. It reports the nearest-rank p95 against the accepted gate.
 *
 * Run it against a production-like environment, never against a real Auction:
 *   pnpm rehearsal:bid -- --teams 16 --tabs 40 --bids 200
 */
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  const { parseEnvironment } = await import("../src/config/environment");
  parseEnvironment(process.env);

  const argv = process.argv.slice(2);
  const argument = (name: string, fallback: number): number => {
    const index = argv.indexOf(name);
    const raw = index >= 0 ? Number(argv[index + 1]) : Number.NaN;
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  };

  const teamCount = argument("--teams", 16);
  const tabCount = argument("--tabs", 40);
  const bidCount = argument("--bids", tabCount * 5);

  const { getPool } = await import("../src/server/database/pool");
  const { createDraftAuction } =
    await import("../src/server/auction-command/auction-command");
  const { createPlayerEntry } =
    await import("../src/server/auction-command/player-entries");
  const { placeBid } = await import("../src/server/auction-command/place-bid");
  const { syncAuctionReadiness } =
    await import("../src/server/auction-command/readiness");
  const { assignPlayerRepresentative } =
    await import("../src/server/auction-command/representatives");
  const { saveSimpleRules } =
    await import("../src/server/auction-command/rules");
  const { selectPlayer } =
    await import("../src/server/auction-command/select-player");
  const { startAuction } =
    await import("../src/server/auction-command/start-auction");
  const { createTeam } = await import("../src/server/auction-command/teams");
  const { bidLatencyGate } =
    await import("../src/server/operations/launch-gates");

  const pool = getPool();
  const label = `rehearsal-${Date.now()}`;

  const createUser = async (name: string): Promise<string> => {
    const id = randomUUID();
    await pool.query(
      `insert into "user" ("id", "name", "email", "emailVerified")
       values ($1, $2, $3, true)`,
      [id, name, `${label}-${name}@example.com`],
    );
    return id;
  };

  try {
    const organizerId = await createUser("organizer");
    const auction = await createDraftAuction(pool, organizerId, {
      closeMode: "manual",
      game: "Rehearsal",
      rulesMode: "simple",
      title: `Rehearsal ${label}`,
    });

    const representatives: { id: string; teamId: string }[] = [];
    for (let index = 0; index < teamCount; index += 1) {
      const team = await createTeam(pool, organizerId, auction.id, {
        name: `Team ${index + 1}`,
      });
      const representative = await createUser(`rep-${index + 1}`);
      const entry = await createPlayerEntry(pool, organizerId, auction.id, {
        displayName: `Player Rep ${index + 1}`,
      });
      await assignPlayerRepresentative(pool, organizerId, auction.id, {
        email: `${label}-rep-${index + 1}@example.com`,
        playerEntryId: entry!.id,
        teamId: team!.id,
      });
      representatives.push({ id: representative, teamId: team!.id });
    }

    const playerCount = Math.max(teamCount * 2, tabCount);
    for (let index = 0; index < playerCount; index += 1) {
      await createPlayerEntry(pool, organizerId, auction.id, {
        displayName: `Player ${index + 1}`,
      });
    }

    await saveSimpleRules(pool, organizerId, auction.id, {
      bidIncrement: 1,
      budget: 1_000_000,
      defaultStartingPrice: 1,
      rosterMax: playerCount,
      rosterMin: teamCount,
      timedCloseSeconds: 3600,
    });
    await syncAuctionReadiness(pool, organizerId, auction.id);
    const started = await startAuction(pool, organizerId, auction.id);
    if (!started) throw new Error("The rehearsal Auction could not start.");
    const revision = started.revision;

    const presentation = await selectPlayer(pool, {
      actorUserId: organizerId,
      auctionId: auction.id,
      commandId: randomUUID(),
      expectedRevision: revision,
      selectionMethod: "manual",
      playerEntryId: (
        await pool.query<{ id: string }>(
          `select "id" from "player_entry"
            where "auction_id" = $1 and not "is_representative"
            order by "created_at" asc limit 1`,
          [auction.id],
        )
      ).rows[0]!.id,
    });
    if (presentation.status !== "accepted") {
      throw new Error("The rehearsal Player could not be offered.");
    }

    const latencies: number[] = [];
    let currentRevision = presentation.revision;
    let amount = presentation.result.startingPrice;

    for (let bid = 0; bid < bidCount; bid += 1) {
      const tab =
        representatives[bid % Math.min(tabCount, representatives.length)]!;
      const startedAt = performance.now();
      const outcome = await placeBid(pool, {
        actorUserId: tab.id,
        amount,
        auctionId: auction.id,
        commandId: randomUUID(),
        expectedRevision: currentRevision,
        presentationId: presentation.result.presentationId,
        teamId: tab.teamId,
      });
      latencies.push(performance.now() - startedAt);
      if (outcome.status === "accepted") {
        currentRevision = outcome.revision;
        amount += 1;
      }
    }

    const result = bidLatencyGate(latencies);
    console.info(`Rehearsal Auction: ${auction.id}`);
    console.info(
      `Teams ${teamCount}, tabs ${tabCount}, Bids ${latencies.length}, p95 ${result.p95Ms.toFixed(1)} ms`,
    );
    console.info(
      `Target < ${result.targetMs} ms: ${result.passesTarget ? "met" : "not met"}; gate < ${result.gateMs} ms: ${result.passesGate ? "met" : "not met"}`,
    );
    process.exitCode = result.passesGate ? 0 : 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    `Rehearsal failed: ${error instanceof Error ? error.message : "unknown failure"}`,
  );
  process.exitCode = 1;
});
