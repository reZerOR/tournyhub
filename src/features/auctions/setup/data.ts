import { notFound } from "next/navigation";
import { cache } from "react";

import type { Auction } from "@/domain/auction";
import { getDraftAuctionForOrganizer } from "@/server/auction-query/auction-query";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

/**
 * A Draft Auction that does not belong to the current session's Organizer
 * looks identical to one that does not exist: this rejects both the same
 * way so a User cannot tell the two apart by guessing an id.
 */
export const requireDraftAuction = cache(
  async (auctionId: string): Promise<Auction> => {
    const session = await getCurrentSession();
    if (!session) notFound();

    const auction = await getDraftAuctionForOrganizer(
      getPool(),
      session.user.id,
      auctionId,
    );
    if (!auction) notFound();

    return auction;
  },
);
