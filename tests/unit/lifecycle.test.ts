import { describe, expect, it } from "vitest";

import {
  ARCHIVE_RETENTION_DAYS,
  archiveDeadline,
  archiveWindowClosed,
  copyAuctionInputSchema,
  defaultCopyTitle,
  isArchivable,
} from "@/domain/lifecycle";

describe("archive lifecycle rules", () => {
  it("allows only the non-live states to be archived", () => {
    expect(isArchivable("draft")).toBe(true);
    expect(isArchivable("ready")).toBe(true);
    expect(isArchivable("completed")).toBe(true);
    expect(isArchivable("cancelled")).toBe(true);
    expect(isArchivable("live")).toBe(false);
    expect(isArchivable("paused")).toBe(false);
    expect(isArchivable("archived")).toBe(false);
  });

  it("sets a seven-day recovery window", () => {
    const now = new Date("2026-09-20T00:00:00.000Z");
    const deadline = archiveDeadline(now);
    expect(deadline.getTime() - now.getTime()).toBe(
      ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
  });

  it("treats the deadline itself as closed and one second earlier as open", () => {
    const deadline = new Date("2026-09-27T00:00:00.000Z");
    expect(archiveWindowClosed(deadline, deadline)).toBe(true);
    expect(
      archiveWindowClosed(deadline, new Date(deadline.getTime() - 1000)),
    ).toBe(false);
    expect(
      archiveWindowClosed(deadline, new Date(deadline.getTime() + 1000)),
    ).toBe(true);
  });
});

describe("defaultCopyTitle", () => {
  it("names the copy after its source and stays within the title limit", () => {
    expect(defaultCopyTitle("Winter Classic")).toBe("Winter Classic copy");
    expect(defaultCopyTitle("   ")).toBe("Untitled Auction copy");
    expect(defaultCopyTitle("x".repeat(300))).toHaveLength(200);
  });
});

describe("copyAuctionInputSchema", () => {
  it("defaults to keeping nothing and copying no Players", () => {
    const parsed = copyAuctionInputSchema.parse({
      sourceAuctionId: "3d9e5f6a-0000-4000-8000-000000000000",
      title: "Copy",
    });
    expect(parsed.keepTierAndPrice).toBe(false);
    expect(parsed.playerEntryIds).toEqual([]);
  });

  it("rejects an empty title", () => {
    expect(() =>
      copyAuctionInputSchema.parse({
        sourceAuctionId: "3d9e5f6a-0000-4000-8000-000000000000",
        title: "   ",
      }),
    ).toThrow();
  });
});
