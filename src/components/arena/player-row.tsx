import * as React from "react";
import { cn } from "cn";

/*
  PlayerRow — the row item in the Player Auction list, mirroring the
  "Player / role / current bid" pattern from the hero. Bid amount is a
  neon-rimmed pill so it reads as the hot value in the row.
*/
type PlayerRowProps = {
  name: string;
  role?: string;
  currentBid?: number;
  isActive?: boolean;
  className?: string;
};

function formatCredits(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function PlayerRow({
  name,
  role,
  currentBid,
  isActive,
  className,
}: PlayerRowProps) {
  return (
    <div
      data-slot="player-row"
      data-active={isActive ? "true" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-2.5",
        isActive
          ? "border-neon/50 bg-neon/10 shadow-[0_0_18px_-6px_color-mix(in_oklab,var(--neon)_70%,transparent)]"
          : "border-border/60 bg-card/40",
        className,
      )}
    >
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold"
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        {role ? (
          <span className="truncate text-xs text-muted-foreground">{role}</span>
        ) : null}
      </div>
      {currentBid !== undefined ? (
        <div
          data-slot="player-bid"
          className={cn(
            "flex flex-col items-end rounded-md border border-neon/40 bg-neon/10 px-2.5 py-1 text-right",
            !isActive && "border-border/60 bg-muted/50 text-muted-foreground",
          )}
        >
          <span className="text-[0.65rem] tracking-[0.18em] text-current/70 uppercase">
            Current bid
          </span>
          <span className="font-mono text-sm font-semibold">
            ${formatCredits(currentBid)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export { PlayerRow };
export type { PlayerRowProps };
