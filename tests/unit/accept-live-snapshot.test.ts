import { describe, expect, it, vi } from "vitest";

import type { LiveSnapshot } from "@/domain/live";
import { acceptLiveSnapshot } from "@/features/auctions/live/accept-live-snapshot";

describe("acceptLiveSnapshot", () => {
  it("ignores a response older than the currently displayed revision", () => {
    const commit = vi.fn();
    const current = { revision: 8 } as LiveSnapshot;
    const delayed = { revision: 7 } as LiveSnapshot;
    acceptLiveSnapshot(current, delayed, commit);
    expect(commit).not.toHaveBeenCalled();
    acceptLiveSnapshot(current, { revision: 8 } as LiveSnapshot, commit);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
