import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  pool: vi.fn(),
  revision: vi.fn(),
  snapshot: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/server/database/pool", () => ({ getPool: mocks.pool }));
vi.mock("@/server/auction-query/live-revision", () => ({
  getLiveRevision: mocks.revision,
}));
vi.mock("@/server/auction-query/live-snapshot", () => ({
  getLiveSnapshot: mocks.snapshot,
}));

import { GET } from "@/app/api/auctions/[id]/snapshot/route";

const context = { params: Promise.resolve({ id: "auction-1" }) };
const request = (since: string) =>
  new Request(
    `http://localhost/api/auctions/auction-1/snapshot?since=${since}`,
  );

describe("GET live snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pool.mockReturnValue({});
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.revision.mockResolvedValue({
      revision: 7,
      serverTime: "2026-09-24T00:00:00.000Z",
    });
    mocks.snapshot.mockResolvedValue({
      snapshot: { revision: 7, serverTime: "2026-09-24T00:00:00.000Z" },
    });
  });

  it("returns 401 before looking up the Auction without a session", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET(request("7"), context);
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.revision).not.toHaveBeenCalled();
  });

  it("returns a generic 404 for inaccessible Auctions", async () => {
    mocks.revision.mockResolvedValue(null);
    const response = await GET(request("7"), context);
    expect(response.status).toBe(404);
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("auction-1");
  });

  it("returns unchanged after one revision check", async () => {
    const response = await GET(request("7"), context);
    expect(await response.json()).toEqual({
      status: "unchanged",
      revision: 7,
      serverTime: "2026-09-24T00:00:00.000Z",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.revision).toHaveBeenCalledTimes(1);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it("returns the authorized snapshot when behind", async () => {
    const response = await GET(request("6"), context);
    expect(await response.json()).toEqual({
      status: "snapshot",
      snapshot: { revision: 7, serverTime: "2026-09-24T00:00:00.000Z" },
    });
    expect(mocks.snapshot).toHaveBeenCalledWith({}, "user-1", "auction-1");
  });
});
