import * as React from "react";
import { cn } from "cn";

import { AuctionPanel } from "./auction-panel";
import { CreditDisplay } from "./credit-display";
import { Trophy } from "./trophy";

/*
  ResultsTrophy — the centerpiece surface for a Completed Auction. Renders
  the trophy, the winning Team, and the per-Team summary. Reads like a
  championship stage.
*/
type ResultRow = {
  id: string;
  teamName: string;
  rosterCount: number;
  spent: number;
  remaining: number;
  rank: number;
  color?: string;
};

type ResultsTrophyProps = {
  auctionName: string;
  winnerTeam: string;
  results: ResultRow[];
  finalBid?: number;
  className?: string;
};

function ResultsTrophy({
  auctionName,
  winnerTeam,
  results,
  finalBid,
  className,
}: ResultsTrophyProps) {
  return (
    <section
      data-slot="results-trophy"
      className={cn(
        "arena-spotlight relative overflow-hidden rounded-2xl p-8 text-center text-spotlight-foreground",
        className,
      )}
    >
      <p className="font-display text-xs tracking-[0.32em] text-neon uppercase">
        Auction complete
      </p>
      <h2 className="mt-2 font-display text-3xl font-semibold">
        {auctionName}
      </h2>

      <div className="my-6 flex justify-center">
        <Trophy
          size={160}
          className="arena-pulse"
          title={`${auctionName} trophy`}
        />
      </div>

      <p className="font-display text-lg tracking-[0.18em] text-muted-foreground uppercase">
        Champion
      </p>
      <p className="arena-text-glow mt-1 font-display text-2xl font-semibold text-neon">
        {winnerTeam}
      </p>

      {finalBid !== undefined ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Final winning bid{" "}
          <CreditDisplay amount={finalBid} size="default" emphasize />
        </p>
      ) : null}

      <AuctionPanel tone="trophy" size="lg" className="mt-8 text-left">
        <h3 className="font-display text-sm font-semibold tracking-[0.18em] uppercase">
          Final standings
        </h3>
        <ul className="flex flex-col gap-2">
          {results.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between rounded-lg border border-current/10 p-3"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">
                  #{row.rank}
                </span>
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center rounded-md border text-xs font-semibold"
                  style={
                    row.color
                      ? {
                          backgroundColor: `color-mix(in oklab, ${row.color} 25%, transparent)`,
                          borderColor: `color-mix(in oklab, ${row.color} 70%, transparent)`,
                          color: row.color,
                        }
                      : undefined
                  }
                >
                  {row.teamName.charAt(0).toUpperCase()}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{row.teamName}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.rosterCount} players
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
                  Spent
                </span>
                <CreditDisplay amount={row.spent} size="default" />
                <span className="text-xs text-muted-foreground">
                  {row.remaining.toLocaleString()} cr left
                </span>
              </div>
            </li>
          ))}
        </ul>
      </AuctionPanel>
    </section>
  );
}

export { ResultsTrophy };
export type { ResultsTrophyProps, ResultRow };
