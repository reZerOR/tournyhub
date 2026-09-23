import type { CloseMode, RulesMode } from "@/domain/auction";
export type { CloseMode, RulesMode };

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
  wrong_amount: "That Bid is below the minimum required amount.",
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
  not_closing: "No closing deadline is running for this Player.",
  not_manual_close: "This Auction uses Timed Close, not Manual Close.",
  not_organizer: "Only the Organizer can control closing.",
  presentation_missing: "There is no Active Player to close.",
  stale_revision: "The Auction changed. Refresh before closing.",
  too_early: "This Player's deadline has not arrived yet.",
};

/**
 * The stable reasons a lifecycle, Tier-progression, or unsold-resolution
 * command is rejected. These commands never accept a Bid, so they do not
 * share the Bid vocabulary.
 */
export const LIFECYCLE_REJECTION_REASONS = [
  "not_organizer",
  "auction_not_live",
  "auction_not_paused",
  "stale_revision",
  "already_paused",
  "not_paused",
  "presentation_active",
  "tier_not_in_auction",
  "no_next_tier",
  "tier_progress_incomplete",
  "unsold_round_open",
  "unsold_pool_open",
  "no_unsold_round",
  "no_eligible_players",
  "matching_required",
  "no_feasible_matching",
  "minimums_unresolved",
  "auction_incomplete",
] as const;

export type LifecycleRejectionReason =
  (typeof LIFECYCLE_REJECTION_REASONS)[number];

export const LIFECYCLE_REJECTION_MESSAGES: Record<
  LifecycleRejectionReason,
  string
> = {
  already_paused: "The Auction is already paused.",
  auction_incomplete:
    "The Auction cannot complete while a Player, Tier, Unsold Pool entry, or Team minimum is unresolved.",
  auction_not_live: "The Auction is not running.",
  auction_not_paused: "Pause the Auction before this change.",
  matching_required:
    "Several Teams and Players remain unresolved. Request constrained matching instead.",
  minimums_unresolved:
    "A Team still misses a required minimum. Resolve it with a Forced Assignment or constrained matching.",
  no_eligible_players: "The Unsold Pool has no eligible Player to offer.",
  no_feasible_matching:
    "No complete assignment satisfies every Team's Budget, minimums, and maximums.",
  no_next_tier: "No later Tier remains to activate.",
  no_unsold_round: "No Unsold Round is open.",
  not_organizer: "Only the Organizer can do that.",
  not_paused: "The Auction is not paused.",
  presentation_active: "Finish or return the Active Player first.",
  stale_revision: "The Auction changed. Refresh before continuing.",
  tier_not_in_auction: "That Tier is not in this Auction.",
  tier_progress_incomplete:
    "Every Player in the current Tier must be offered once before the Auction moves on.",
  unsold_pool_open:
    "The Unsold Pool still holds unresolved Players. Close it or resolve them first.",
  unsold_round_open: "An Unsold Round is already open.",
};

/** The stable reasons a correction is rejected. */
export const CORRECTION_REJECTION_REASONS = [
  "not_organizer",
  "auction_not_paused",
  "stale_revision",
  "presentation_missing",
  "no_bid",
  "sale_missing",
  "already_reversed",
  "no_legal_completion",
  "reason_required",
  "invalid_amount",
  "player_already_sold",
  "player_is_representative",
  "insufficient_budget",
  "roster_max_reached",
  "tier_max_reached",
] as const;

export type CorrectionRejectionReason =
  (typeof CORRECTION_REJECTION_REASONS)[number];

export const CORRECTION_REJECTION_MESSAGES: Record<
  CorrectionRejectionReason,
  string
> = {
  already_reversed: "That Sale is already reversed.",
  auction_not_paused: "Pause the Auction before correcting it.",
  insufficient_budget: "That Team cannot afford that amount.",
  invalid_amount: "The amount must be a whole number of at least 1 Credit.",
  no_bid: "There is no accepted Bid to cancel.",
  no_legal_completion:
    "That correction would leave no Legal Completion. Resolve the Auction first.",
  not_organizer: "Only the Organizer can correct the Auction.",
  player_already_sold: "That Player has already been sold.",
  player_is_representative: "Player Representatives cannot be sold.",
  presentation_missing: "That Player is no longer Active.",
  reason_required: "Enter a reason of at most 200 characters.",
  roster_max_reached: "That Team has reached its maximum Roster size.",
  sale_missing: "That Sale is not part of this Auction.",
  stale_revision: "The Auction changed. Refresh before correcting.",
  tier_max_reached: "That Team has reached the maximum for that Tier.",
};

/** The maximum length of an Organizer-supplied correction reason. */
export const CORRECTION_REASON_MAX = 200;

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

export interface LiveRosterPlayer {
  amount: number;
  id: string;
  isRepresentative?: boolean;
  name: string;
  source: "bid" | "forced" | "preassigned";
  tierId: null | string;
}

/** Public, contact-free player directory included in authorized live snapshots. */
export interface LivePlayerSummary {
  id: string;
  displayName: string;
  tierId: null | string;
  status:
    | "waiting"
    | "active"
    | "sold"
    | "forced"
    | "preassigned"
    | "unsold"
    | "final_unsold";
  teamId: null | string;
  amount: null | number;
}

export interface LiveTeamPublicState {
  color: null | string;
  id: string;
  isLeader: boolean;
  name: null | string;
  players?: LiveRosterPlayer[];
  position: number;
  remainingBudget: number;
  rosterCount: number;
  spentCredits: number;
  tierCounts: Record<string, number>;
}

export interface LiveCustomFieldValue {
  id?: string;
  label: string;
  value: string;
}

export interface LivePlayerDetails {
  customFields: LiveCustomFieldValue[];
  displayName: string;
  externalPlayerId: null | string;
  id: string;
  isRepresentative?: boolean;
  role: null | string;
  startingPrice: null | number;
  teamColor?: null | string;
  teamName?: null | string;
  tierId: null | string;
  tierLabel: null | string;
}

export interface LiveActivePlayer {
  /**
   * The authoritative Timed Close deadline, or null when no countdown runs.
   * A browser countdown must be derived from this and never from its own clock.
   */
  closeDeadline: null | string;
  customFields?: LiveCustomFieldValue[];
  displayName: string;
  externalPlayerId?: null | string;
  presentationId: string;
  playerEntryId: string;
  role: null | string;
  selectionMethod: "forced" | "manual" | "random";
  startingPrice: number;
  state: "closing" | "open";
  tierId: null | string;
  tierLabel: null | string;
  /** The Manual Close warning deadline, or null when no warning runs. */
  warningDeadline: null | string;
}

/** The progress of one Tier towards finishing. */
export interface LiveTierProgress {
  biddableCount: number;
  complete: boolean;
  id: string;
  isActive: boolean;
  label: string;
  maxPerTeam: number;
  minPerTeam: number;
  offeredCount: number;
  position: number;
  startingPrice: number;
}

/** The open Unsold Round, if any. */
export interface LiveUnsoldRound {
  eligibleCount: number;
  id: string;
  offeredCount: number;
  sequence: number;
}

/** A committed Sale the Organizer may still reverse. */
export interface LiveSale {
  amount: number;
  playerDisplayName: string;
  playerEntryId: string;
  saleId: string;
  source: "bid" | "forced";
  teamId: string;
  tierId: null | string;
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

export interface LiveBidItem {
  amount: number;
  id: string;
  serverTime: string;
  teamId: string;
}

export interface LiveSnapshot {
  activePlayer: LiveActivePlayer | null;
  activeTierId: null | string;
  auctionId: string;
  bids?: LiveBidItem[];
  closeMode: CloseMode;
  currentBid: null | { amount: number; teamId: string };
  /** Teams that still miss a required total or Tier minimum. */
  deficientTeamIds: string[];
  /** Players still eligible for the Active Tier or Unsold Round. */
  eligiblePlayerCount: number;
  lifecycle: LiveStatus;
  nextBidAmount: null | number;
  /** The next Tier the Organizer may activate, if one exists. */
  nextTierId: null | string;
  /** Unreversed Sales the Organizer may reverse while Paused. */
  openSales: LiveSale[];
  players: LivePlayerSummary[];
  revision: number;
  rulesMode: RulesMode;
  serverTime: string;
  teams: LiveTeamPublicState[];
  tierCountsEnabled: boolean;
  tiers: LiveTierProgress[];
  /** The whole-second Timed Close duration, or null under Manual Close. */
  timedCloseSeconds: null | number;
  /** Unresolved memberships in the Unsold Pool. */
  unsoldPoolCount: number;
  unsoldRound: LiveUnsoldRound | null;
  you: LiveCallerPrivateState;
  /** Private rejected details: every Team's for the Organizer, own Team's for a Representative. */
  rejections: LiveBidRejection[];
}

/**
 * The default Timed Close duration in whole seconds. The Organizer may raise
 * or lower it before the Auction starts.
 */
export const DEFAULT_TIMED_CLOSE_SECONDS = 30;

/** The Timed Close response window: a final-seconds Bid moves the deadline. */
export const ANTI_SNIPE_SECONDS = 5;
