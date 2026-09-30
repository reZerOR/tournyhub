import { randomUUID } from "node:crypto";

import nextEnv from "@next/env";
import { Pool } from "pg";

import type { LiveSnapshot } from "../src/domain/live";

/**
 * The full Live Auction rehearsal.
 *
 * Unlike `rehearsal-bid-latency.ts`, which awaits Bids in a single loop and
 * therefore cannot reproduce contention, this models the workload that failed:
 * 11 concurrent consoles (1 Organizer + 10 Team Representatives) on an Auction
 * the size of the production one (93 Player Entries, 10 Teams, 6 Tiers, roster
 * 9-10, Budget 9000, increment 50), driving a full Player Presentation
 * lifecycle including the Manual Close warning and the finalize storm.
 *
 * It exists to answer two questions with numbers instead of reasoning:
 *   1. How many Auction row locks does one Player Presentation cost?
 *   2. What share of Bids is refused `stale_revision`, and what does that cost?
 *
 * Both are controlled by flags so the *client* behaviour can be compared before
 * and after the fixes, without touching application code:
 *   --finalizers=all|organizer   every console wakes the close, or only the Organizer
 *   --bids=blind|preflight       bid against a possibly stale revision, or refresh first
 *   --sync=pull|delta            resync from a full snapshot, or apply the Broadcast
 *                                deltas and fall back to a pull only when it must
 *
 * Safety: it creates a synthetic Auction with the real commands, so it refuses to
 * run when APP_ENVIRONMENT=production unless --allow-production is passed.
 *
 * Usage (never against a real Auction):
 *   pnpm rehearsal:live --database-url postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *     --lots 39 --finalizers=organizer --bids=preflight
 */

const TIERS = [
  {
    label: "E-Tier",
    maxPerTeam: 1,
    minPerTeam: 1,
    players: 10,
    startingPrice: 200,
  },
  {
    label: "C-Tier",
    maxPerTeam: 2,
    minPerTeam: 2,
    players: 20,
    startingPrice: 500,
  },
  {
    label: "S-Tier",
    maxPerTeam: 1,
    minPerTeam: 1,
    players: 10,
    startingPrice: 2500,
  },
  {
    label: "A-Tier",
    maxPerTeam: 2,
    minPerTeam: 0,
    players: 13,
    startingPrice: 1800,
  },
  {
    label: "B-Tier",
    maxPerTeam: 2,
    minPerTeam: 0,
    players: 13,
    startingPrice: 1000,
  },
  {
    label: "D-Tier",
    maxPerTeam: 3,
    minPerTeam: 1,
    players: 17,
    startingPrice: 400,
  },
] as const;

const TEAM_COUNT = 10;
const NON_REP_PLAYERS = TIERS.reduce((total, tier) => total + tier.players, 0);

/** Accepts both `--name value` and `--name=value`; ignores a bare `--`. */
function flagValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  const next = index >= 0 ? process.argv[index + 1] : undefined;
  return next === "--" ? undefined : next;
}

function argument(name: string, fallback: number): number {
  const value = Number(flagValue(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function choice<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = flagValue(name);
  if (raw === undefined) return fallback;
  if (allowed.includes(raw as T)) return raw as T;
  throw new Error(`${name} must be one of ${allowed.join(", ")}`);
}

const LOTS = argument("--lots", 39);
const ROUNDS = argument("--rounds", 1);
/**
 * Production saw about five Bids per Player Presentation (192 Bids over 39
 * Presentations), so a lot draws from a rotating subset of Teams rather than
 * from all ten. Raise it with --bidders 10 for a heavier contention run.
 */
const BIDDERS = argument("--bidders", 5);
const POLL_MS = argument("--poll-ms", 15_000);
const DUPLICATE_FINALIZES = argument("--duplicate-finalizes", 10);
const FINALIZERS = choice("--finalizers", ["all", "organizer"], "organizer");
const BID_MODE = choice("--bids", ["blind", "preflight"], "preflight");
const SYNC_MODE = choice("--sync", ["pull", "delta"], "pull");

const databaseUrlArgument = flagValue("--database-url");

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
  ]!;
}

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  const { parseEnvironment } = await import("../src/config/environment");
  const environment = parseEnvironment(process.env);

  if (
    environment.APP_ENVIRONMENT === "production" &&
    !process.argv.includes("--allow-production")
  ) {
    throw new Error(
      "Refusing to run against a production environment. Pass --allow-production only for a disposable database.",
    );
  }

  const databaseUrl = databaseUrlArgument ?? environment.DATABASE_URL;
  console.info(
    `Target: ${new URL(databaseUrl).hostname}${new URL(databaseUrl).pathname} (password hidden)`,
  );

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 15,
    ssl:
      databaseUrl.includes("supabase.co") ||
      databaseUrl.includes("pooler.supabase.com")
        ? { rejectUnauthorized: false }
        : undefined,
  });

  // This harness is only ever pointed at a disposable database. It removes the
  // Auctions and Users a previous run left behind, so a crashed run does not
  // block the next one (the beta allows one Live Auction at a time) and repeated
  // runs stay comparable. Both prefixes are unique to this script.
  const cleanup = async () => {
    await pool.query(
      `delete from "auction" where "title" like 'Rehearsal rehearsal-%'`,
    );
    await pool.query(
      `delete from "user" where "email" like 'rehearsal-%@example.com'`,
    );
  };
  await cleanup();

  const { createDraftAuction } =
    await import("../src/server/auction-command/auction-command");
  const { createPlayerEntry } =
    await import("../src/server/auction-command/player-entries");
  const { createTeam } = await import("../src/server/auction-command/teams");
  const { assignPlayerRepresentative } =
    await import("../src/server/auction-command/representatives");
  const { saveTieredRules } =
    await import("../src/server/auction-command/rules");
  const { assignPlayerTier, createTier } =
    await import("../src/server/auction-command/tiers");
  const { syncAuctionReadiness } =
    await import("../src/server/auction-command/readiness");
  const { startAuction } =
    await import("../src/server/auction-command/start-auction");
  const { loadEligiblePlayers, selectPlayer } =
    await import("../src/server/auction-command/select-player");
  const { activateTier } =
    await import("../src/server/auction-command/tier-progress");
  const {
    beginManualClose,
    finalizePresentation,
    MANUAL_CLOSE_WARNING_SECONDS,
  } = await import("../src/server/auction-command/close-player");
  const MANUAL_CLOSE_WARNING_MS = MANUAL_CLOSE_WARNING_SECONDS * 1_000;
  const { placeBid } = await import("../src/server/auction-command/place-bid");
  const { getLiveRevision } =
    await import("../src/server/auction-query/live-revision");
  const { getLiveSnapshot } =
    await import("../src/server/auction-query/live-snapshot");
  const { applyLiveDelta } = await import("../src/domain/live-delta");

  const label = `rehearsal-${Date.now()}`;

  const createUser = async (suffix: string): Promise<string> => {
    const id = randomUUID();
    await pool.query(
      `insert into "user" ("id", "name", "email", "emailVerified")
       values ($1, $2, $3, true)`,
      [id, `${label}-${suffix}`, `${label}-${suffix}@example.com`],
    );
    return id;
  };

  // ---------------------------------------------------------------- fixture
  const organizerId = await createUser("organizer");
  const auction = await createDraftAuction(pool, organizerId, {
    closeMode: "manual",
    game: "Rehearsal",
    rulesMode: "tiered",
    title: `Rehearsal ${label}`,
  });

  const tiers: { id: string; label: string; players: string[] }[] = [];
  const teamIds: string[] = [];

  for (const tier of TIERS) {
    const created = await createTier(pool, organizerId, auction.id, {
      label: tier.label,
      maxPerTeam: tier.maxPerTeam,
      minPerTeam: tier.minPerTeam,
      startingPrice: tier.startingPrice,
    });
    if (!created) throw new Error(`Could not create Tier ${tier.label}.`);
    tiers.push({ id: created.id, label: tier.label, players: [] });
  }

  // Players, plus one Player Representative per Team.
  const representatives: {
    revision: number;
    teamId: string;
    userId: string;
  }[] = [];
  for (let index = 0; index < TEAM_COUNT; index += 1) {
    const team = await createTeam(pool, organizerId, auction.id, {
      name: `Team ${index + 1}`,
    });
    if (!team) throw new Error("Could not create Team.");
    teamIds.push(team.id);

    const repUserId = await createUser(`rep-${index + 1}`);
    const repEntry = await createPlayerEntry(pool, organizerId, auction.id, {
      displayName: `Rep ${index + 1}`,
    });
    if (!repEntry)
      throw new Error("Could not create a Representative Player Entry.");
    await assignPlayerRepresentative(pool, organizerId, auction.id, {
      email: `${label}-rep-${index + 1}@example.com`,
      playerEntryId: repEntry.id,
      teamId: team.id,
    });
    representatives.push({ revision: 0, teamId: team.id, userId: repUserId });
  }

  for (const [tierIndex, tier] of TIERS.entries()) {
    for (let index = 0; index < tier.players; index += 1) {
      const entry = await createPlayerEntry(pool, organizerId, auction.id, {
        displayName: `${tier.label} Player ${index + 1}`,
      });
      if (!entry) throw new Error("Could not create a Player Entry.");
      await assignPlayerTier(
        pool,
        organizerId,
        auction.id,
        entry.id,
        tiers[tierIndex]!.id,
      );
      tiers[tierIndex]!.players.push(entry.id);
    }
  }

  await saveTieredRules(pool, organizerId, auction.id, {
    budget: 9_000,
    bidIncrement: 50,
    rosterMax: 10,
    rosterMin: 9,
    timedCloseSeconds: 30,
  });
  await syncAuctionReadiness(pool, organizerId, auction.id);
  const started = await startAuction(pool, organizerId, auction.id);
  if (!started) throw new Error("The rehearsal Auction could not start.");

  console.info(
    `Fixture ready: ${NON_REP_PLAYERS} non-Representative Players, ${TEAM_COUNT} Teams, ${tiers.length} Tiers, ${NON_REP_PLAYERS + TEAM_COUNT} Player Entries`,
  );

  // ------------------------------------------------------- running accounts
  /**
   * Every normalized statement that acquires the Auction row lock. Reading only
   * the single top statement by total time would miss a second normalized
   * variant of the same lock (PostgreSQL normalizes by query text), so the
   * counts are summed.
   */
  const FOR_UPDATE_MATCH = `%"auction"%for update%`;
  const readLockStats = async () => {
    const row = (
      await pool.query<{
        calls: string;
        max_exec_time: number;
        total_exec_time: number;
      }>(
        `select coalesce(sum(calls), 0)::text as calls,
                coalesce(sum(total_exec_time), 0) as total_exec_time,
                coalesce(max(max_exec_time), 0) as max_exec_time
           from pg_stat_statements
          where query like $1`,
        [FOR_UPDATE_MATCH],
      )
    ).rows[0];
    return {
      calls: Number(row?.calls ?? 0),
      maxMs: Number(row?.max_exec_time ?? 0),
      totalMs: Number(row?.total_exec_time ?? 0),
    };
  };
  const statsBefore = await readLockStats();

  let revision = started.revision;
  const organizer = { revision };
  for (const rep of representatives) rep.revision = revision;

  const bidLatencies: number[] = [];
  const bidReasons = new Map<string, number>();
  const finalizeReasons = new Map<string, number>();
  let bidsAccepted = 0;
  let bidsAttempted = 0;
  let finalizeCalls = 0;
  let lotsClosed = 0;
  let snapshotBytes = 0;
  let unchangedBytes = 0;
  let snapshotPulls = 0;
  let unchangedChecks = 0;
  let deltaApplied = 0;
  let deltaBytes = 0;
  let lastPresentationId: null | string = null;

  let polling = true;
  const pollers = [
    { revision, snapshot: null as LiveSnapshot | null, userId: organizerId },
    ...representatives.map((rep) => ({
      revision,
      snapshot: null as LiveSnapshot | null,
      userId: rep.userId,
    })),
  ].map(async (client) => {
    while (polling) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      if (!polling) return;
      try {
        if (SYNC_MODE === "delta") {
          const events = await pool.query<{
            kind: string;
            payload: Record<string, unknown>;
            revision: number;
          }>(
            `select "kind", "payload", "revision" from "auction_outbox_event"
              where "auction_id" = $1 and "revision" > $2 order by "revision" asc`,
            [auction.id, client.revision],
          );
          let current = client.snapshot;
          let complete = true;
          for (const event of events.rows) {
            const applied = current ? applyLiveDelta(current, event) : null;
            if (!applied) {
              complete = false;
              break;
            }
            current = applied;
            deltaApplied += 1;
            deltaBytes += JSON.stringify(event).length;
          }
          if (complete && current) {
            client.snapshot = current;
            client.revision = current.revision;
            continue;
          }
          // A gap, or a change the console cannot apply from its payload: fall
          // back to the full pull, which stays the resync path.
          const access = await getLiveSnapshot(pool, client.userId, auction.id);
          if (!access) continue;
          client.snapshot = access.snapshot;
          client.revision = access.snapshot.revision;
          snapshotPulls += 1;
          snapshotBytes = JSON.stringify(access.snapshot).length;
          continue;
        }

        const current = await getLiveRevision(pool, client.userId, auction.id);
        if (!current) continue;
        if (current.revision === client.revision) {
          unchangedChecks += 1;
          unchangedBytes = JSON.stringify({
            status: "unchanged",
            ...current,
          }).length;
          continue;
        }
        const access = await getLiveSnapshot(pool, client.userId, auction.id);
        if (!access) continue;
        client.revision = access.snapshot.revision;
        snapshotPulls += 1;
        snapshotBytes = JSON.stringify(access.snapshot).length;
      } catch {
        // A failed poll is what the console tolerates; the run continues.
      }
    }
  });

  const offerQueue = tiers.flatMap((tier) => tier.players);
  const activeTierIds = new Set<string>();

  /**
   * A real console re-reads the Auction before it acts. The Organizer's
   * revision must be refreshed too, or every Organizer command issued after
   * another Team's Bid is refused `stale_revision` and the lot never closes.
   */
  const refreshOrganizer = async () => {
    const current = await getLiveRevision(pool, organizerId, auction.id);
    if (current) organizer.revision = current.revision;
  };

  for (let lot = 0; lot < LOTS; lot += 1) {
    const playerEntryId = offerQueue[lot];
    if (!playerEntryId) break;

    await refreshOrganizer();

    // The Tier that owns this Player must be active before it can be offered.
    const owningTier = tiers.find((tier) =>
      tier.players.includes(playerEntryId),
    )!;
    if (!activeTierIds.has(owningTier.id)) {
      const activated = await activateTier(pool, {
        actorUserId: organizerId,
        auctionId: auction.id,
        commandId: randomUUID(),
        expectedRevision: organizer.revision,
        tierId: owningTier.id,
      });
      if (activated.status === "accepted" || activated.status === "replayed") {
        organizer.revision = activated.revision;
      }
      activeTierIds.add(owningTier.id);
    }

    const eligible = await loadEligiblePlayers(
      pool,
      auction.id,
      "tiered",
      owningTier.id,
      0,
      null,
    );
    if (!eligible || eligible.length === 0) continue;

    const offered = await selectPlayer(pool, {
      actorUserId: organizerId,
      auctionId: auction.id,
      commandId: randomUUID(),
      expectedRevision: organizer.revision,
      playerEntryId,
      selectionMethod: "manual",
    });
    if (offered.status !== "accepted" && offered.status !== "replayed") {
      const key =
        offered.status === "rejected"
          ? `select:${offered.reason}`
          : `select_${offered.status}`;
      bidReasons.set(key, (bidReasons.get(key) ?? 0) + 1);
      continue;
    }
    organizer.revision = offered.revision;
    const presentationId = offered.result.presentationId;

    // Bidding round: every Team that is not already leading may bid once.
    let amount = offered.result.startingPrice;
    let leader: null | string = null;
    const order = [...representatives]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(BIDDERS, representatives.length));

    for (let round = 0; round < ROUNDS; round += 1) {
      for (const rep of order) {
        if (rep.teamId === leader) continue;

        if (BID_MODE === "preflight") {
          const current = await getLiveRevision(pool, rep.userId, auction.id);
          if (current) rep.revision = current.revision;
        }

        bidsAttempted += 1;
        const at = performance.now();
        const outcome = await placeBid(pool, {
          actorUserId: rep.userId,
          amount,
          auctionId: auction.id,
          commandId: randomUUID(),
          expectedRevision: rep.revision,
          presentationId,
          teamId: rep.teamId,
        });
        bidLatencies.push(performance.now() - at);

        if (outcome.status === "accepted") {
          bidsAccepted += 1;
          rep.revision = outcome.revision;
          leader = rep.teamId;
          amount = amount + 50;
          continue;
        }
        if (outcome.status === "replayed") {
          rep.revision = outcome.revision;
          leader = rep.teamId;
          amount = amount + 50;
          continue;
        }
        if (outcome.status === "rejected") {
          bidReasons.set(
            outcome.reason,
            (bidReasons.get(outcome.reason) ?? 0) + 1,
          );
          if (BID_MODE === "preflight" && outcome.reason === "stale_revision") {
            // One silent retry, as the console now does.
            const refreshed = await getLiveRevision(
              pool,
              rep.userId,
              auction.id,
            );
            if (refreshed) rep.revision = refreshed.revision;
            bidsAttempted += 1;
            const retryAt = performance.now();
            const retry = await placeBid(pool, {
              actorUserId: rep.userId,
              amount,
              auctionId: auction.id,
              commandId: randomUUID(),
              expectedRevision: rep.revision,
              presentationId,
              teamId: rep.teamId,
            });
            bidLatencies.push(performance.now() - retryAt);
            if (retry.status === "accepted" || retry.status === "replayed") {
              bidsAccepted += 1;
              rep.revision = retry.revision;
              leader = rep.teamId;
              amount = amount + 50;
            } else if (retry.status === "rejected") {
              bidReasons.set(
                retry.reason,
                (bidReasons.get(retry.reason) ?? 0) + 1,
              );
            }
          }
          continue;
        }
      }
    }

    // Manual Close: the Organizer starts the warning, then every console wakens
    // the close once the database deadline passes.
    await refreshOrganizer();
    const warning = await beginManualClose(pool, {
      actorUserId: organizerId,
      auctionId: auction.id,
      commandId: randomUUID(),
      expectedRevision: organizer.revision,
      presentationId,
    });
    if (warning.status === "accepted" || warning.status === "replayed") {
      organizer.revision = warning.revision;
    } else if (warning.status === "rejected") {
      const key = `begin_close:${warning.reason}`;
      bidReasons.set(key, (bidReasons.get(key) ?? 0) + 1);
    }
    await new Promise((resolve) =>
      setTimeout(resolve, MANUAL_CLOSE_WARNING_MS + 300),
    );

    const finalizers = [
      { userId: organizerId },
      ...representatives.map((rep) => ({ userId: rep.userId })),
    ];
    const wakeUps =
      FINALIZERS === "all" ? finalizers : [{ userId: organizerId }];

    const closes = await Promise.all(
      wakeUps.map(async (client) => {
        finalizeCalls += 1;
        return finalizePresentation(pool, {
          actorUserId: client.userId,
          auctionId: auction.id,
          commandId: randomUUID(),
          presentationId,
        });
      }),
    );
    for (const close of closes) {
      const key =
        close.status === "rejected" ? `rejected:${close.reason}` : close.status;
      finalizeReasons.set(key, (finalizeReasons.get(key) ?? 0) + 1);
    }
    lastPresentationId = presentationId;

    const after = await getLiveRevision(pool, organizerId, auction.id);
    if (after) {
      revision = after.revision;
      organizer.revision = after.revision;
      for (const rep of representatives) rep.revision = after.revision;
    }
    lotsClosed += 1;
  }

  polling = false;
  await Promise.allSettled(pollers);

  // An explicit, poll-independent sample of both response shapes, so the byte
  // figures do not depend on how often the simulated pollers happened to fire.
  const snapshotSample = await getLiveSnapshot(pool, organizerId, auction.id);
  if (snapshotSample) {
    snapshotBytes = JSON.stringify(snapshotSample.snapshot).length;
  }
  const revisionSample = await getLiveRevision(pool, organizerId, auction.id);
  if (revisionSample) {
    unchangedBytes = JSON.stringify({
      status: "unchanged",
      ...revisionSample,
    }).length;
  }

  // Isolate the server half of ticket 03: once a Presentation is committed,
  // what do extra wakes cost now that `settledOutcome()` answers before any
  // transaction is opened?
  let duplicateLockCalls = 0;
  if (lastPresentationId) {
    const settledPresentationId = lastPresentationId;
    const beforeDuplicates = await readLockStats();
    await Promise.all(
      Array.from({ length: DUPLICATE_FINALIZES }, () =>
        finalizePresentation(pool, {
          actorUserId: organizerId,
          auctionId: auction.id,
          commandId: randomUUID(),
          presentationId: settledPresentationId,
        }),
      ),
    );
    duplicateLockCalls = (await readLockStats()).calls - beforeDuplicates.calls;
  }

  const statsAfter = await readLockStats();
  const lockCalls = statsAfter.calls - statsBefore.calls;
  const lockCommandCalls = lockCalls - duplicateLockCalls;
  const lockTotalMs = statsAfter.totalMs - statsBefore.totalMs;
  const lockMaxMs = statsAfter.maxMs;
  const staleRejections = bidReasons.get("stale_revision") ?? 0;

  console.info("");
  console.info(`==== rehearsal result (${label}) ====`);
  console.info(
    `mode: finalizers=${FINALIZERS} bids=${BID_MODE} sync=${SYNC_MODE} lots=${lotsClosed} pollMs=${POLL_MS}`,
  );
  console.info("");
  console.info(`Auction row locks (from pg_stat_statements, this run only)`);
  console.info(
    `  acquisitions          ${lockCalls}  (${lockCommandCalls} from the workload, ${duplicateLockCalls} from the duplicate-wake probe)`,
  );
  console.info(
    `  per Presentation      ${lotsClosed > 0 ? (lockCommandCalls / lotsClosed).toFixed(2) : "n/a"} commands, each taking exactly one lock`,
  );
  console.info(`  total lock wait       ${lockTotalMs.toFixed(0)} ms`);
  console.info(
    `  mean lock wait        ${lockCalls > 0 ? (lockTotalMs / lockCalls).toFixed(1) : "n/a"} ms   (production: 1934 ms)`,
  );
  console.info(
    `  max lock wait         ${lockMaxMs.toFixed(0)} ms   (production: 10669 ms)`,
  );
  console.info("");
  console.info(`Bids`);
  console.info(`  attempts              ${bidsAttempted}`);
  console.info(`  accepted              ${bidsAccepted}`);
  console.info(
    `  stale_revision        ${staleRejections}  (${bidsAttempted > 0 ? ((staleRejections / bidsAttempted) * 100).toFixed(1) : "0"}% of attempts; production 46.9%)`,
  );
  console.info(
    `  latency p50/p95/max   ${percentile(bidLatencies, 0.5).toFixed(0)} / ${percentile(bidLatencies, 0.95).toFixed(0)} / ${Math.max(...bidLatencies, 0).toFixed(0)} ms`,
  );
  console.info(
    `  rejection reasons     ${JSON.stringify(Object.fromEntries(bidReasons))}`,
  );
  console.info("");
  console.info(`Finalization`);
  console.info(`  wake-ups issued       ${finalizeCalls}`);
  console.info(
    `  per Presentation      ${lotsClosed > 0 ? (finalizeCalls / lotsClosed).toFixed(2) : "n/a"}   (production: 7.72, target <= 1.2)`,
  );
  console.info(
    `  duplicate probe       ${DUPLICATE_FINALIZES} extra wakes cost ${duplicateLockCalls} auction row locks`,
  );
  console.info(
    `  outcomes              ${JSON.stringify(Object.fromEntries(finalizeReasons))}`,
  );
  console.info("");
  console.info(`Snapshot fan-out`);
  console.info(
    `  full snapshot         ${(snapshotBytes / 1024).toFixed(1)} KiB  (${snapshotPulls} pulls)`,
  );
  console.info(
    `  unchanged check       ${unchangedBytes} bytes  (${unchangedChecks} checks)`,
  );
  console.info(
    `  delta applied         ${deltaApplied} events, ${deltaBytes} bytes total  (avg ${deltaApplied > 0 ? (deltaBytes / deltaApplied).toFixed(0) : "n/a"} B)`,
  );
  console.info(
    `  derived egress        ${((snapshotBytes * snapshotPulls + deltaBytes) / 1024 / 1024 / 1024 || 0).toFixed(3)} GiB for this run`,
  );
  console.info("");
  console.info(`Auction: ${auction.id}`);

  await cleanup();
  await pool.end();
}

main().catch((error: unknown) => {
  console.error(
    `Rehearsal failed: ${error instanceof Error ? error.message : "unknown failure"}`,
  );
  process.exitCode = 1;
});
