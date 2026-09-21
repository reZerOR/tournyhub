import * as React from "react";
import { Calendar, Users } from "lucide-react";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";

/*
  AuctionStatusCard — used in the auctions list. Renders the Game name,
  Auction lifecycle state, Teams count, and a relative date. Surfaces the
  state through Badge variant + a colored side rail, not text alone.
*/
type LifecycleState =
  "Draft" | "Ready" | "Live" | "Paused" | "Completed" | "Cancelled";

type AuctionStatusCardProps = {
  title: string;
  game: string;
  state: LifecycleState;
  teamCount: number;
  playerCount: number;
  scheduledAt?: string;
  onClick?: () => void;
  className?: string;
};

const stateVariant: Record<
  LifecycleState,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  Draft: "outline",
  Ready: "roster",
  Live: "neon",
  Paused: "warning",
  Completed: "success",
  Cancelled: "destructive",
};

const stateRail: Record<LifecycleState, string> = {
  Draft: "before:bg-muted-foreground/40",
  Ready: "before:bg-roster",
  Live: "before:bg-neon before:shadow-[0_0_18px_-2px_color-mix(in_oklab,var(--neon)_70%,transparent)]",
  Paused: "before:bg-warning",
  Completed: "before:bg-success",
  Cancelled: "before:bg-destructive",
};

function AuctionStatusCard({
  title,
  game,
  state,
  teamCount,
  playerCount,
  scheduledAt,
  onClick,
  className,
}: AuctionStatusCardProps) {
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      data-slot="auction-status-card"
      data-state={state}
      onClick={onClick}
      disabled={!interactive}
      className={cn(
        "arena-panel relative w-full overflow-hidden rounded-xl p-4 text-left transition-all",
        "before:absolute before:top-3 before:bottom-3 before:left-0 before:w-1 before:rounded-r-full",
        stateRail[state],
        interactive &&
          "hover:border-neon/40 hover:shadow-[0_0_24px_-10px_color-mix(in_oklab,var(--neon)_70%,transparent)] focus-visible:ring-2 focus-visible:ring-ring/50",
        !interactive && "cursor-default",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-display text-xs tracking-[0.18em] text-muted-foreground uppercase">
            {game}
          </span>
          <span className="font-display text-lg font-semibold">{title}</span>
        </div>
        <Badge variant={stateVariant[state]}>{state}</Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Users aria-hidden className="size-3.5" />
          {teamCount} teams · {playerCount} players
        </span>
        {scheduledAt ? (
          <span className="inline-flex items-center gap-1">
            <Calendar aria-hidden className="size-3.5" />
            {scheduledAt}
          </span>
        ) : null}
      </div>
    </button>
  );
}

export { AuctionStatusCard };
export type { AuctionStatusCardProps, LifecycleState };
