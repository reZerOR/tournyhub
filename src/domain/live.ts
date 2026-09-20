import type { CloseMode, RulesMode } from "@/domain/auction";

/** The lifecycle states in which the live consoles are available. */
export const LIVE_STATUSES = ["live", "paused"] as const;
export type LiveStatus = (typeof LIVE_STATUSES)[number];

export function isLiveStatus(status: string): status is LiveStatus {
  return status === "live" || status === "paused";
}

/**
 * The stable reasons a live command can be rejected. Every rejection the
 * Organizer or submitting Representative sees is one of these, so the UI can
 * explain it without trusting free text.
 */
export const BID_REJECTION_REASONS = [
  "auction_not_live",
  "auction_paused",
  "stale_revision",
  "presentation_missing",
  "presentation_not_open",
  "deadline_passed",
  "not_representative",
  "already_leading",
  "wrong_amount",
  "insufficient_budget",
  "roster_max_reached",
  "tier_max_reached",
  "no_legal_completion",
] as const;

export type BidRejectionReason = (typeof BID_REJECTION_REASONS)[number];

/**
 * The stable reasons a Player-selection command is rejected. Selection and Bid
 * rejection share no vocabulary because they expose different information.
 */
export const SELECTION_REJECTION_REASONS = [
  "not_organizer",
  "auction_not_live",
  "stale_revision",
  "presentation_active",
  "presentation_missing",
  "no_eligible_players",
  "not_eligible",
  "bid_exists",
  "reason_required",
] as const;

export type SelectionRejectionReason =
  (typeof SELECTION_REJECTION_REASONS)[number];

export const SELECTION_REJECTION_MESSAGES: Record<
  SelectionRejectionReason,
  string
> = {
  auction_not_live: "The Auction is not running.",
  bid_exists: "A Bid already exists. Use the correction flow instead.",
  no_eligible_players: "No eligible Player remains in this queue.",
  not_eligible: "That Player is not eligible to be offered.",
  not_organizer: "Only the Organizer can select a Player.",
  presentation_active: "A Player is already Active.",
  presentation_missing: "That Player is no longer Active.",
  reason_required: "Enter a reason of at most 200 characters.",
  stale_revision: "The Auction changed. Refresh before selecting.",
};

export const BID_REJECTION_MESSAGES: Record<BidRejectionReason, string> = {
  already_leading: "Your Team already leads this Player.",
  auction_not_live: "The Auction is not accepting Bids.",
  auction_paused: "The Auction is paused.",
  deadline_passed: "Bidding for this Player has closed.",
  insufficient_budget: "Your Team cannot afford that Bid.",
  no_legal_completion:
    "That Bid would make a legal finish impossible for some Team.",
  not_representative: "You do not represent that Team.",
  presentation_missing: "There is no Active Player to bid on.",
  presentation_not_open: "Bidding for this Player is not open.",
  roster_max_reached: "Your Team has reached its maximum Roster size.",
  stale_revision: "The Auction changed. Refresh before bidding.",
  tier_max_reached: "Your Team has reached that Tier's maximum.",
  wrong_amount: "That is not the exact next Bid.",
};

/** The stable reasons a close command is rejected. */
export const CLOSE_REJECTION_REASONS = [
  "not_organizer",
  "auction_not_live",
  "stale_revision",
  "presentation_missing",
  "not_manual_close",
  "already_closing",
  "not_closing",
  "too_early",
] as const;

export type CloseRejectionReason = (typeof CLOSE_REJECTION_REASONS)[number];

export const CLOSE_REJECTION_MESSAGES: Record<CloseRejectionReason, string> = {
  already_closing: "A closing warning is already running.",
  auction_not_live: "The Auction is not running.",
  not_closing: "No closing warning is running for this Player.",
  not_manual_close: "This Auction uses Timed Close, not Manual Close.",
  not_organizer: "Only the Organizer can control closing.",
  presentation_missing: "There is no Active Player to close.",
  stale_revision: "The Auction changed. Refresh before closing.",
  too_early: "The closing warning has not finished yet.",
};

/** The committed outcome of a finalized Player Presentation. */
export type PresentationOutcome =
  | { amount: number; kind: "sold"; saleId: string; teamId: string }
  | { kind: "unsold" };

/**
 * The exact next valid Bid: the Starting Price for the first Bid, otherwise
 * the current price plus the fixed Bid Increment.
 */
export function nextBidAmount({
  bidIncrement,
  currentAmount,
  startingPrice,
}: {
  bidIncrement: number;
  currentAmount: null | number;
  startingPrice: number;
}): number {
  return currentAmount === null ? startingPrice : currentAmount + bidIncrement;
}

/** A private rejected Bid detail, visible only to the Organizer and the submitting Team. */
export interface LiveBidRejection {
  amount: number;
  reason: BidRejectionReason;
  serverTime: string;
}

export interface LiveTeamPublicState {
  color: null | string;
  id: string;
  isLeader: boolean;
  name: null | string;
  position: number;
  remainingBudget: number;
  rosterCount: number;
  spentCredits: number;
  tierCounts: Record<string, number>;
}

export interface LiveActivePlayer {
  displayName: string;
  presentationId: string;
  playerEntryId: string;
  role: null | string;
  selectionMethod: "manual" | "random";
  startingPrice: number;
  state: "closing" | "open";
  tierId: null | string;
  tierLabel: null | string;
  warningDeadline: null | string;
}

export interface LiveCallerPrivateState {
  isLeader: boolean;
  maxRoster: number;
  remainingBudget: number;
  role: "organizer" | "representative";
  rosterCount: number;
  spentCredits: number;
  teamId: null | string;
  tierCounts: Record<string, number>;
  tierLimits: Record<string, { max: number; min: number }>;
}

export interface LiveSnapshot {
  activePlayer: LiveActivePlayer | null;
  activeTierId: null | string;
  auctionId: string;
  closeMode: CloseMode;
  currentBid: null | { amount: number; teamId: string };
  lifecycle: LiveStatus;
  nextBidAmount: null | number;
  revision: number;
  rulesMode: RulesMode;
  serverTime: string;
  teams: LiveTeamPublicState[];
  tierCountsEnabled: boolean;
  you: LiveCallerPrivateState;
  /** Private rejected details: every Team's for the Organizer, own Team's for a Representative. */
  rejections: LiveBidRejection[];
  /** Players still eligible for the Active Tier or Unsold Round. */
  eligiblePlayerCount: number;
}
