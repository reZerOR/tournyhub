import type { Auction, CloseMode, RulesMode } from "@/domain/auction";

export interface SerializedAuction {
  closeMode: CloseMode;
  game: string;
  id: string;
  rulesMode: RulesMode;
  title: string;
  updatedAt: string;
}

export function serializeAuction(auction: Auction): SerializedAuction {
  return {
    closeMode: auction.closeMode,
    game: auction.game,
    id: auction.id,
    rulesMode: auction.rulesMode,
    title: auction.title,
    updatedAt: auction.updatedAt.toISOString(),
  };
}
