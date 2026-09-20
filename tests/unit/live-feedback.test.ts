import { describe, expect, it } from "vitest";

import type { LiveSnapshot } from "@/domain/live";
import {
  describeLiveChange,
  isEditableTarget,
  shortcutActionFor,
  soundCueFor,
} from "@/features/auctions/live/live-feedback";

function snapshot(overrides: Partial<LiveSnapshot> = {}): LiveSnapshot {
  return {
    activePlayer: null,
    activeTierId: null,
    auctionId: "auction-1",
    closeMode: "manual",
    currentBid: null,
    deficientTeamIds: [],
    eligiblePlayerCount: 4,
    lifecycle: "live",
    nextBidAmount: 10,
    nextTierId: null,
    openSales: [],
    rejections: [],
    revision: 1,
    rulesMode: "simple",
    serverTime: new Date("2026-09-20T10:00:00.000Z").toISOString(),
    teams: [
      {
        color: null,
        id: "reds",
        isLeader: false,
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
      isLeader: false,
      maxRoster: 3,
      remainingBudget: 100,
      role: "organizer",
      rosterCount: 0,
      spentCredits: 0,
      teamId: null,
      tierCounts: {},
      tierLimits: {},
    },
    ...overrides,
  };
}

const activePlayer = {
  closeDeadline: null,
  displayName: "Alice",
  playerEntryId: "player-1",
  presentationId: "presentation-1",
  role: null,
  selectionMethod: "manual" as const,
  startingPrice: 10,
  state: "open" as const,
  tierId: null,
  tierLabel: null,
  warningDeadline: null,
};

/** A minimal stand-in for a DOM element, so the guard is testable without jsdom. */
function element(tagName: string, matches: string[] = []): EventTarget {
  return {
    closest: (selector: string) => (matches.includes(selector) ? {} : null),
    tagName,
  } as unknown as EventTarget;
}

describe("isEditableTarget", () => {
  it("treats typing surfaces and dialogs as editable", () => {
    expect(isEditableTarget(element("INPUT"))).toBe(true);
    expect(isEditableTarget(element("TEXTAREA"))).toBe(true);
    expect(isEditableTarget(element("SELECT"))).toBe(true);
    expect(isEditableTarget(element("DIV", ['[contenteditable="true"]']))).toBe(
      true,
    );
    expect(isEditableTarget(element("BUTTON", ['[role="dialog"]']))).toBe(true);
  });

  it("leaves ordinary elements, non-elements, and null alone", () => {
    expect(isEditableTarget(element("BUTTON"))).toBe(false);
    expect(isEditableTarget(element("DIV"))).toBe(false);
    expect(isEditableTarget({} as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("shortcutActionFor", () => {
  it("maps the published letters regardless of case", () => {
    expect(shortcutActionFor({ key: "P", target: null })).toBe("pause_resume");
    expect(shortcutActionFor({ key: "c", target: null })).toBe("close_toggle");
    expect(shortcutActionFor({ key: "U", target: null })).toBe("mark_unsold");
    expect(shortcutActionFor({ key: "n", target: null })).toBe("next_player");
  });

  it("ignores modifier combinations, typing, and non-letter keys", () => {
    expect(
      shortcutActionFor({ ctrlKey: true, key: "p", target: null }),
    ).toBeNull();
    expect(
      shortcutActionFor({ key: "p", metaKey: true, target: null }),
    ).toBeNull();
    expect(
      shortcutActionFor({ key: "p", target: element("INPUT") }),
    ).toBeNull();
    expect(shortcutActionFor({ key: "Enter", target: null })).toBeNull();
    expect(shortcutActionFor({ key: "z", target: null })).toBeNull();
  });
});

describe("describeLiveChange", () => {
  it("stays silent when nothing material changed", () => {
    expect(describeLiveChange(snapshot(), snapshot())).toBeNull();
    expect(
      describeLiveChange(snapshot({ revision: 2 }), snapshot({ revision: 2 })),
    ).toBeNull();
  });

  it("announces a pause and a resume", () => {
    expect(
      describeLiveChange(snapshot(), snapshot({ lifecycle: "paused" })),
    ).toBe("The Auction is paused.");
    expect(
      describeLiveChange(
        snapshot({ lifecycle: "paused" }),
        snapshot({ lifecycle: "live" }),
      ),
    ).toBe("The Auction is running again.");
  });

  it("announces a Sale, a close warning, a leader change, and an Unsold result", () => {
    const sold = snapshot({
      revision: 2,
      teams: [
        {
          color: null,
          id: "reds",
          isLeader: true,
          name: "Reds",
          position: 0,
          remainingBudget: 90,
          rosterCount: 2,
          spentCredits: 10,
          tierCounts: {},
        },
      ],
    });
    expect(describeLiveChange(snapshot(), sold)).toBe(
      "A Player was sold to Reds.",
    );

    expect(
      describeLiveChange(
        snapshot({ activePlayer: activePlayer, revision: 2 }),
        snapshot({
          activePlayer: {
            ...activePlayer,
            state: "closing",
            warningDeadline: "2026-09-20T10:00:03.000Z",
          },
          revision: 3,
        }),
      ),
    ).toBe("Closing warning started for Alice.");

    expect(
      describeLiveChange(
        snapshot({ revision: 2 }),
        snapshot({
          currentBid: { amount: 15, teamId: "reds" },
          revision: 3,
        }),
      ),
    ).toBe("Reds now leads at 15.");

    expect(
      describeLiveChange(
        snapshot({ activePlayer: activePlayer, revision: 2 }),
        snapshot({ revision: 3 }),
      ),
    ).toBe("The Player was not sold and returned to the queue.");
  });
});

describe("soundCueFor", () => {
  it("maps changes to cues and stays silent on an unchanged poll", () => {
    expect(soundCueFor(snapshot(), snapshot())).toBeNull();

    const sold = snapshot({
      revision: 2,
      teams: [
        {
          color: null,
          id: "reds",
          isLeader: false,
          name: "Reds",
          position: 0,
          remainingBudget: 90,
          rosterCount: 2,
          spentCredits: 10,
          tierCounts: {},
        },
      ],
    });
    expect(soundCueFor(snapshot(), sold)).toBe("sold");

    expect(
      soundCueFor(
        snapshot({ activePlayer: activePlayer, revision: 2 }),
        snapshot({ revision: 3 }),
      ),
    ).toBe("unsold");

    expect(
      soundCueFor(
        snapshot({ revision: 2 }),
        snapshot({
          currentBid: { amount: 15, teamId: "reds" },
          revision: 3,
        }),
      ),
    ).toBe("bid");
  });
});
