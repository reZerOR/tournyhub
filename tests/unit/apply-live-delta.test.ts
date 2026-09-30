import { describe, expect, it } from "vitest";

import type { LiveSnapshot } from "@/domain/live";
import { applyLiveDelta, parseLiveDeltaEvent } from "@/domain/live-delta";

const activePlayer = {
  closeDeadline: "2026-09-20T10:00:30.000Z",
  displayName: "Alice",
  playerEntryId: "player-1",
  presentationId: "presentation-1",
  role: null,
  selectionMethod: "manual" as const,
  startingPrice: 10,
  state: "open" as const,
  tierId: "tier-1",
  tierLabel: "Bronze",
  warningDeadline: null,
};

function snapshot(overrides: Partial<LiveSnapshot> = {}): LiveSnapshot {
  return {
    activePlayer,
    activeTierId: "tier-1",
    auctionId: "auction-1",
    bids: [
      {
        amount: 10,
        id: "bid-1",
        serverTime: "2026-09-20T10:00:00.000Z",
        teamId: "reds",
      },
    ],
    closeMode: "manual",
    currentBid: { amount: 10, teamId: "reds" },
    deficientTeamIds: [],
    eligiblePlayerCount: 4,
    lifecycle: "live",
    nextBidAmount: 15,
    nextTierId: null,
    openSales: [],
    players: [],
    representatives: [],
    rejections: [],
    revision: 7,
    rulesMode: "simple",
    serverTime: "2026-09-20T10:00:00.000Z",
    teams: [
      {
        color: null,
        id: "reds",
        isLeader: true,
        name: "Reds",
        position: 0,
        remainingBudget: 100,
        rosterCount: 1,
        spentCredits: 0,
        tierCounts: {},
      },
      {
        color: null,
        id: "blues",
        isLeader: false,
        name: "Blues",
        position: 1,
        remainingBudget: 100,
        rosterCount: 1,
        spentCredits: 0,
        tierCounts: {},
      },
    ],
    tierCountsEnabled: false,
    tiers: [],
    timedCloseSeconds: null,
    unsoldPoolCount: 0,
    unsoldRound: null,
    you: {
      isLeader: true,
      maxRoster: 3,
      remainingBudget: 100,
      role: "representative",
      rosterCount: 0,
      spentCredits: 0,
      teamId: "reds",
      tierCounts: {},
      tierLimits: {},
    },
    ...overrides,
  };
}

const bidDelta = {
  kind: "bid_accepted",
  payload: {
    amount: 15,
    bidAttemptId: "bid-2",
    closeDeadline: "2026-09-20T10:00:35.000Z",
    nextBidAmount: 20,
    presentationId: "presentation-1",
    serverTime: "2026-09-20T10:00:05.000Z",
    teamId: "blues",
  },
  revision: 8,
};

describe("parseLiveDeltaEvent", () => {
  it("accepts a well-formed event and rejects anything else", () => {
    expect(parseLiveDeltaEvent(bidDelta)).toEqual(bidDelta);
    expect(parseLiveDeltaEvent(null)).toBeNull();
    expect(parseLiveDeltaEvent([bidDelta])).toBeNull();
    expect(parseLiveDeltaEvent({ revision: 1 })).toBeNull();
    expect(
      parseLiveDeltaEvent({ kind: "x", payload: {}, revision: 1.5 }),
    ).toBeNull();
    expect(
      parseLiveDeltaEvent({ kind: "", payload: {}, revision: 1 }),
    ).toBeNull();
    expect(
      parseLiveDeltaEvent({ kind: "x", payload: [], revision: 1 }),
    ).toBeNull();
  });
});

describe("applyLiveDelta", () => {
  it("advances an accepted Bid without touching the rest of the state", () => {
    const before = snapshot();
    const next = applyLiveDelta(before, bidDelta);
    expect(next).not.toBeNull();
    expect(next!.revision).toBe(8);
    expect(next!.currentBid).toEqual({ amount: 15, teamId: "blues" });
    expect(next!.nextBidAmount).toBe(20);
    expect(next!.bids).toHaveLength(2);
    expect(next!.bids!.at(-1)).toEqual({
      amount: 15,
      id: "bid-2",
      serverTime: "2026-09-20T10:00:05.000Z",
      teamId: "blues",
    });
    // The leading Team changes, and the console's own Team is no longer leading.
    expect(next!.teams.map((team) => team.isLeader)).toEqual([false, true]);
    expect(next!.you.isLeader).toBe(false);
    // The committed deadline replaces the previous one.
    expect(next!.activePlayer!.closeDeadline).toBe("2026-09-20T10:00:35.000Z");
    // Nothing derived from the database was invented.
    expect(next!.teams).toEqual(
      before.teams.map((team) => ({
        ...team,
        isLeader: team.id === "blues",
      })),
    );
    expect(next!.players).toEqual(before.players);
    expect(next!.openSales).toEqual(before.openSales);
  });

  it("cancels a running close warning when a Bid reopens bidding", () => {
    const before = snapshot({
      activePlayer: {
        ...activePlayer,
        state: "closing",
        warningDeadline: "2026-09-20T10:00:08.000Z",
      },
    });
    const next = applyLiveDelta(before, bidDelta);
    expect(next!.activePlayer!.state).toBe("open");
    expect(next!.activePlayer!.warningDeadline).toBeNull();
  });

  it("applies a close-warning and its cancellation to the Active Player", () => {
    const warned = applyLiveDelta(snapshot(), {
      kind: "close_warning",
      payload: {
        presentationId: "presentation-1",
        warningDeadline: "2026-09-20T10:00:03.000Z",
      },
      revision: 8,
    });
    expect(warned!.activePlayer).toMatchObject({
      state: "closing",
      warningDeadline: "2026-09-20T10:00:03.000Z",
    });

    const cancelled = applyLiveDelta(warned!, {
      kind: "close_warning_cancelled",
      payload: { presentationId: "presentation-1" },
      revision: 9,
    });
    expect(cancelled!.activePlayer).toMatchObject({
      state: "open",
      warningDeadline: null,
    });
  });

  it("returns null for a gap, an unknown kind, a stale event, or a mismatch", () => {
    // A gap: the console is a revision behind and must resync.
    expect(applyLiveDelta(snapshot(), { ...bidDelta, revision: 9 })).toBeNull();
    // An already-applied event.
    expect(applyLiveDelta(snapshot(), { ...bidDelta, revision: 7 })).toBeNull();
    // A kind the console cannot apply from its payload alone — sale, Tier,
    // Unsold Pool, pause — falls back to the revision pull.
    expect(
      applyLiveDelta(snapshot(), {
        kind: "player_sold",
        payload: {},
        revision: 8,
      }),
    ).toBeNull();
    // A delta for a Player the console no longer shows.
    expect(
      applyLiveDelta(snapshot({ activePlayer: null }), bidDelta),
    ).toBeNull();
    expect(
      applyLiveDelta(snapshot(), {
        ...bidDelta,
        payload: { ...bidDelta.payload, presentationId: "other" },
      }),
    ).toBeNull();
    // A payload missing a field the console needs cannot be applied.
    const incomplete: Record<string, unknown> = { ...bidDelta.payload };
    delete incomplete.bidAttemptId;
    expect(
      applyLiveDelta(snapshot(), { ...bidDelta, payload: incomplete }),
    ).toBeNull();
  });
});
