import { z } from "zod";

/**
 * Auction copying and the archive lifecycle.
 *
 * An Archived Auction is hidden from the normal lists, rejects ordinary Auction
 * commands, and is permanently deleted once its seven-day recovery window
 * closes. Restore returns it to the state it was archived from.
 */
export const ARCHIVE_RETENTION_DAYS = 7;

/** The states an Auction may be archived from. A Live or Paused Auction never is. */
export const ARCHIVABLE_STATUSES = [
  "draft",
  "ready",
  "completed",
  "cancelled",
] as const;

export type ArchivableStatus = (typeof ARCHIVABLE_STATUSES)[number];

export function isArchivable(status: string): status is ArchivableStatus {
  return (ARCHIVABLE_STATUSES as readonly string[]).includes(status);
}

/** Seven days after `now`, the moment an Archived Auction may be deleted. */
export function archiveDeadline(now: Date): Date {
  return new Date(now.getTime() + ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/** True once the recovery window has closed and deletion is permitted. */
export function archiveWindowClosed(deadline: Date, now: Date): boolean {
  return deadline.getTime() <= now.getTime();
}

/**
 * A copy's options. `playerEntryIds` is explicit, so the Organizer chooses
 * exactly which Player Entries travel into the new Draft. An empty list copies
 * none. `keepTierAndPrice` decides whether Tier membership and Starting Prices
 * come across or are configured again.
 */
export const copyAuctionInputSchema = z.object({
  keepTierAndPrice: z.boolean().default(false),
  playerEntryIds: z.array(z.uuid()).default([]),
  sourceAuctionId: z.uuid(),
  title: z.string().trim().min(1, "Enter a title.").max(200),
});

export type CopyAuctionInput = z.input<typeof copyAuctionInputSchema>;

/** The default title offered for a copy, so the source is recognizable. */
export function defaultCopyTitle(sourceTitle: string): string {
  const trimmed = sourceTitle.trim() || "Untitled Auction";
  return `${trimmed} copy`.slice(0, 200);
}
