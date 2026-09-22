import type { AuctionRuleSet } from "@/domain/rules";
import type { Team } from "@/domain/team";
import type { Tier } from "@/domain/tier";
import type { RepresentativeView } from "@/server/auction-query/representatives";

export interface SerializedTeam {
  color: null | string;
  id: string;
  logoHref: null | string;
  name: null | string;
  position: number;
  representativeType: null | "outside" | "player";
}

export function serializeTeam(team: Team, auctionId: string): SerializedTeam {
  return {
    color: team.color,
    id: team.id,
    logoHref: team.logoStorageKey
      ? `/app/auctions/${auctionId}/teams/${team.id}/logo`
      : null,
    name: team.name,
    position: team.position,
    representativeType: team.representativeType,
  };
}

export interface SerializedRepresentativeView {
  invitation: null | { email: string; expiresAt: string };
  playerEntry: null | { displayName: string; id: string };
  team: SerializedTeam;
  user: null | { email: string; id: string; name: string };
}

export function serializeRepresentativeView(
  view: RepresentativeView,
  auctionId: string,
): SerializedRepresentativeView {
  return {
    invitation: view.invitation
      ? {
          email: view.invitation.email,
          expiresAt: view.invitation.expiresAt.toISOString(),
        }
      : null,
    playerEntry: view.playerEntry,
    team: serializeTeam(view.team, auctionId),
    user: view.user,
  };
}

export interface SerializedRuleSet {
  bidIncrement: null | number;
  budget: null | number;
  defaultStartingPrice: null | number;
  rosterMax: null | number;
  rosterMin: null | number;
  timedCloseSeconds: number;
}

export function serializeRuleSet(ruleSet: AuctionRuleSet): SerializedRuleSet {
  return {
    bidIncrement: ruleSet.bidIncrement,
    budget: ruleSet.budget,
    defaultStartingPrice: ruleSet.defaultStartingPrice,
    rosterMax: ruleSet.rosterMax,
    rosterMin: ruleSet.rosterMin,
    timedCloseSeconds: ruleSet.timedCloseSeconds,
  };
}

export interface SerializedTier {
  id: string;
  label: string;
  maxPerTeam: number;
  minPerTeam: number;
  position: number;
  startingPrice: number;
}

export function serializeTier(tier: Tier): SerializedTier {
  return {
    id: tier.id,
    label: tier.label,
    maxPerTeam: tier.maxPerTeam,
    minPerTeam: tier.minPerTeam,
    position: tier.position,
    startingPrice: tier.startingPrice,
  };
}

export interface SerializedTierAssignment {
  displayName: string;
  id: string;
  role?: null | string;
  tierId: null | string;
}
