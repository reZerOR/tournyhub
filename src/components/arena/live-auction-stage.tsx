import * as React from "react";
import { cn } from "cn";

import { AuctionPanel } from "./auction-panel";
import { BidConsole } from "./bid-controls";
import { CreditDisplay } from "./credit-display";
import { LiveBadge } from "./live-badge";
import { PlayerRow } from "./player-row";
import { TeamChip } from "./team-chip";
import { Trophy } from "./trophy";

/*
  LiveAuctionStage — the centerpiece of a Live Auction. Composes the
  active Player spotlight on the left, the bidding column on the right,
  and the Teams strip across the bottom. Uses arena-spotlight as the
  backdrop so the stage feels like it's lit from above.
*/
type StageTeam = {
  id: string;
  name: string;
  color?: string;
  budgetRemaining: number;
  budgetTotal: number;
  isLeading?: boolean;
  rank?: number;
};

type StagePlayer = {
  id: string;
  name: string;
  role?: string;
  currentBid: number;
  isActive?: boolean;
};

type LiveAuctionStageProps = {
  auctionName: string;
  activePlayer: StagePlayer;
  bidIncrement: number;
  currentBid: number;
  budgetRemaining: number;
  pendingBid: number;
  teams: StageTeam[];
  players: StagePlayer[];
  onBidChange?: (next: number) => void;
  onSubmitBid?: () => void;
  onPlaceBidDisabled?: boolean;
  onPlaceBidPending?: boolean;
  className?: string;
};

function LiveAuctionStage({
  auctionName,
  activePlayer,
  bidIncrement,
  currentBid,
  budgetRemaining,
  pendingBid,
  teams,
  players,
  onBidChange,
  onSubmitBid,
  onPlaceBidDisabled,
  onPlaceBidPending,
  className,
}: LiveAuctionStageProps) {
  return (
    <section
      data-slot="live-auction-stage"
      className={cn(
        "arena-spotlight relative overflow-hidden rounded-2xl p-6 text-spotlight-foreground",
        className,
      )}
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Trophy
            size={36}
            className="text-neon"
            title={`${auctionName} trophy`}
          />
          <div>
            <h2 className="font-display text-lg font-semibold tracking-[0.18em] uppercase">
              {auctionName}
            </h2>
            <p className="text-xs text-muted-foreground">
              Active Tier · Bidding live
            </p>
          </div>
        </div>
        <LiveBadge />
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <AuctionPanel
          tone="spotlight"
          size="lg"
          className="text-spotlight-foreground"
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-12 items-center justify-center rounded-full border border-neon/50 bg-neon/15 text-sm font-semibold text-neon"
            >
              {activePlayer.name.charAt(0).toUpperCase()}
            </span>
            <div className="flex flex-col">
              <span className="font-display text-2xl font-semibold">
                {activePlayer.name}
              </span>
              {activePlayer.role ? (
                <span className="text-xs text-muted-foreground">
                  {activePlayer.role}
                </span>
              ) : null}
            </div>
          </div>
          <div className="arena-divider my-2" />
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Highest bid
            </span>
            <CreditDisplay
              amount={currentBid}
              size="xl"
              emphasize
              className="text-spotlight-foreground"
            />
          </div>
        </AuctionPanel>

        <BidConsole
          currentBid={currentBid}
          nextBid={pendingBid}
          budgetRemaining={budgetRemaining}
          bidIncrement={bidIncrement}
          onBidChange={onBidChange}
          onSubmit={onSubmitBid}
          disabled={onPlaceBidDisabled}
          isPending={onPlaceBidPending}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <AuctionPanel
          label="Players in active tier"
          tone="glass"
          size="default"
        >
          <div className="flex flex-col gap-2">
            {players.map((player) => (
              <PlayerRow
                key={player.id}
                name={player.name}
                role={player.role}
                currentBid={player.currentBid}
                isActive={player.id === activePlayer.id}
              />
            ))}
          </div>
        </AuctionPanel>

        <AuctionPanel label="Teams" tone="glass" size="default">
          <div className="flex flex-col gap-2">
            {teams.map((team) => (
              <TeamChip
                key={team.id}
                name={team.name}
                color={team.color}
                budgetRemaining={team.budgetRemaining}
                budgetTotal={team.budgetTotal}
                isLeading={team.isLeading}
                rank={team.rank}
              />
            ))}
          </div>
        </AuctionPanel>
      </div>
    </section>
  );
}

export { LiveAuctionStage };
export type { LiveAuctionStageProps, StageTeam, StagePlayer };
