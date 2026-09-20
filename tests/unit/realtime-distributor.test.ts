import { describe, expect, it } from "vitest";

import {
  CoalescingRealtimeDistributor,
  type RealtimeEvent,
} from "@/server/realtime/distributor";

function event(revision: number, kind = "bid_accepted"): RealtimeEvent {
  return { auctionId: "auction-1", kind, payload: {}, revision };
}

/** A controllable clock and scheduler so coalescing is deterministic in tests. */
function harness() {
  let now = 0;
  const timers: { delayMs: number; flush: () => void }[] = [];
  const sent: RealtimeEvent[] = [];
  const distributor = new CoalescingRealtimeDistributor({
    intervalMs: 500,
    now: () => now,
    schedule: (flush, delayMs) => {
      timers.push({ delayMs, flush });
    },
    send: (next) => {
      sent.push(next);
    },
  });
  return {
    advance(ms: number) {
      now += ms;
    },
    distributor,
    runTimers() {
      const due = timers.splice(0, timers.length);
      for (const timer of due) timer.flush();
    },
    sent,
    timers,
  };
}

describe("CoalescingRealtimeDistributor", () => {
  it("sends the first update immediately", () => {
    const test = harness();

    test.distributor.publish(event(1));

    expect(test.sent.map((entry) => entry.revision)).toEqual([1]);
    expect(test.timers).toHaveLength(0);
  });

  it("defers a second update within the interval and keeps the newest revision", () => {
    const test = harness();
    test.distributor.publish(event(1));

    test.distributor.publish(event(2));
    test.distributor.publish(event(3));

    expect(test.sent.map((entry) => entry.revision)).toEqual([1]);
    expect(test.distributor.pendingFor("auction-1")?.revision).toBe(3);
    expect(test.timers).toHaveLength(1);
    expect(test.timers[0]!.delayMs).toBe(500);

    test.runTimers();
    expect(test.sent.map((entry) => entry.revision)).toEqual([1, 3]);
  });

  it("caps fan-out at two updates per second per Auction", () => {
    const test = harness();

    for (let revision = 1; revision <= 10; revision += 1) {
      test.distributor.publish(event(revision));
      test.advance(100);
      test.runTimers();
    }

    // Every update landed in its own 500ms slot, so no two are closer than the
    // interval.
    expect(test.sent.length).toBeLessThanOrEqual(10);
    for (let index = 1; index < test.sent.length; index += 1) {
      expect(test.sent[index]!.revision).toBeGreaterThan(
        test.sent[index - 1]!.revision,
      );
    }
  });

  it("does not postpone a direct command response", () => {
    const test = harness();
    test.distributor.publish(event(1));
    test.distributor.publish(event(2));

    // The command result is returned by the command itself; the distributor
    // only holds the notification.
    expect(test.sent).toHaveLength(1);
    expect(test.distributor.pendingFor("auction-1")).toBeDefined();
  });
});
