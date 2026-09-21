import * as React from "react";
import { Gavel, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

/*
  BidConsole — the dedicated controls surface a Team Representative uses
  to place, raise, or retract a Bid. Renders the live bid amount as a
  spotlight number, a Bid Increment stepper, and the primary
  "Place Bid" Button at neon intensity.
*/
type BidConsoleProps = {
  currentBid: number;
  nextBid: number;
  budgetRemaining: number;
  bidIncrement: number;
  onBidChange?: (next: number) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  isPending?: boolean;
};

function formatCredits(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function BidConsole({
  currentBid,
  nextBid,
  budgetRemaining,
  bidIncrement,
  onBidChange,
  onSubmit,
  disabled,
  isPending,
}: BidConsoleProps) {
  const minNext = currentBid + bidIncrement;
  const maxNext = Math.min(nextBid, budgetRemaining);
  const valid = nextBid >= minNext && nextBid <= budgetRemaining;

  const step = (delta: number) => {
    const updated = Math.min(
      Math.max(nextBid + delta, minNext),
      budgetRemaining,
    );
    onBidChange?.(updated);
  };

  return (
    <div
      data-slot="bid-console"
      className="arena-panel flex flex-col gap-4 rounded-xl p-4"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Current bid
        </span>
        <span className="font-mono text-sm text-muted-foreground">
          {formatCredits(currentBid)} cr
        </span>
      </div>

      <div className="arena-glow rounded-lg p-4 text-center">
        <div className="text-xs tracking-[0.18em] text-neon uppercase">
          Your bid
        </div>
        <div
          data-slot="bid-amount"
          className="arena-text-glow font-display text-4xl font-semibold text-foreground"
        >
          {formatCredits(nextBid)} cr
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">
          +{formatCredits(bidIncrement)} cr step · budget{" "}
          {formatCredits(budgetRemaining)} cr
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Decrease bid by one increment"
          onClick={() => step(-bidIncrement)}
          disabled={disabled || nextBid <= minNext}
        >
          <Minus data-icon="inline-start" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Increase bid by one increment"
          onClick={() => step(bidIncrement)}
          disabled={disabled || nextBid >= maxNext}
        >
          <Plus data-icon="inline-start" />
        </Button>
      </div>

      <Button
        variant="neon"
        size="xl"
        onClick={onSubmit}
        disabled={disabled || !valid}
        aria-busy={isPending}
      >
        <Gavel data-icon="inline-start" />
        Place bid
      </Button>

      {!valid ? (
        <p className="text-center text-xs text-muted-foreground">
          Bid must be between {formatCredits(minNext)} and{" "}
          {formatCredits(maxNext)} credits.
        </p>
      ) : null}
    </div>
  );
}

export { BidConsole };
export type { BidConsoleProps };
