import { z } from "zod";

export const RULES_MODES = ["simple", "tiered"] as const;
export const CLOSE_MODES = ["manual", "timed"] as const;
export const AUCTION_STATUSES = [
  "draft",
  "ready",
  "live",
  "paused",
  "completed",
  "cancelled",
  "archived",
] as const;

export type RulesMode = (typeof RULES_MODES)[number];
export type CloseMode = (typeof CLOSE_MODES)[number];
export type AuctionStatus = (typeof AUCTION_STATUSES)[number];

export interface Auction {
  closeMode: CloseMode;
  createdAt: Date;
  game: string;
  id: string;
  organizerId: string;
  rulesMode: RulesMode;
  status: AuctionStatus;
  title: string;
  updatedAt: Date;
}

export const auctionBasicsSchema = z.object({
  closeMode: z.enum(CLOSE_MODES),
  game: z.string().trim().min(1, "Enter a Game.").max(100),
  rulesMode: z.enum(RULES_MODES),
  title: z.string().trim().min(1, "Enter a title.").max(200),
});

export type AuctionBasicsInput = z.infer<typeof auctionBasicsSchema>;
