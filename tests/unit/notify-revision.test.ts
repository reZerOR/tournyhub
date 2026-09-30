import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/realtime/grant", () => ({
  auctionBroadcastTopic: (id: string) => `topic-${id}`,
}));

import { notifyRevision } from "@/server/realtime/notify-revision";

function database() {
  const query = vi
    .fn()
    .mockResolvedValueOnce({
      rows: [
        {
          id: "1",
          auction_id: "auction-1",
          revision: 3,
          kind: "bid",
          payload: {},
        },
        {
          id: "2",
          auction_id: "auction-1",
          revision: 5,
          kind: "bid",
          payload: {},
        },
      ],
    })
    .mockResolvedValue({ rows: [] });
  return { query };
}

describe("notifyRevision", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts every pending change as a delta and marks them published", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    const db = database();
    await notifyRevision(db, "auction-1");

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://example.supabase.co/realtime/v1/api/broadcast");
    expect(init.headers).toMatchObject({
      apikey: "anon-key",
      Authorization: "Bearer anon-key",
    });
    expect(JSON.parse(init.body)).toEqual({
      messages: [
        {
          topic: "topic-auction-1",
          event: "rev",
          payload: { kind: "bid", payload: {}, revision: 3 },
          private: false,
        },
        {
          topic: "topic-auction-1",
          event: "rev",
          payload: { kind: "bid", payload: {}, revision: 5 },
          private: false,
        },
      ],
    });
    expect(db.query.mock.calls[1]![1]).toEqual([["1", "2"]]);
  });

  it("leaves events pending on HTTP failure so the next attempt retries them", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = database();
    await expect(notifyRevision(db, "auction-1")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    // Only the outbox read ran. Without the UPDATE the events stay pending, so
    // the next command retries the nudge instead of losing it to the poll.
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("skips delivery without configuration and marks events published", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const db = database();
    await notifyRevision(db, "auction-1");
    expect(fetch).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(2);
  });
});
