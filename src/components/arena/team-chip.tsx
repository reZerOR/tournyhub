import * as React from "react";
import { Crown, Shield } from "lucide-react";
import { cn } from "cn";

/*
  TeamChip — the rounded badge with a Team logo and Budget that fills the
  right-hand Teams panel of the arena. Color comes from the Team's chosen
  hex; we always tint it toward neon for contrast on dark canvas.
*/
type TeamChipProps = {
  name: string;
  color?: string;
  budgetRemaining?: number;
  budgetTotal?: number;
  rank?: number;
  isLeading?: boolean;
  className?: string;
};

function formatCredits(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function TeamChip({
  name,
  color,
  budgetRemaining,
  budgetTotal,
  rank,
  isLeading,
  className,
}: TeamChipProps) {
  return (
    <div
      data-slot="team-chip"
      className={cn(
        "arena-panel flex items-center gap-3 rounded-lg p-2.5",
        isLeading &&
          "border-neon/50 shadow-[0_0_18px_-6px_color-mix(in_oklab,var(--neon)_60%,transparent)]",
        className,
      )}
    >
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-md border text-xs font-semibold"
        style={
          color
            ? {
                backgroundColor: `color-mix(in oklab, ${color} 25%, transparent)`,
                borderColor: `color-mix(in oklab, ${color} 70%, transparent)`,
                color,
              }
            : undefined
        }
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        {budgetRemaining !== undefined ? (
          <span className="font-mono text-xs text-muted-foreground">
            {formatCredits(budgetRemaining)}
            {budgetTotal ? ` / ${formatCredits(budgetTotal)} cr` : " cr"}
          </span>
        ) : null}
      </div>
      {isLeading ? (
        <Crown
          data-icon="inline-end"
          className="size-4 text-warning"
          aria-label="Leading team"
        />
      ) : rank ? (
        <span className="font-mono text-xs text-muted-foreground">#{rank}</span>
      ) : null}
    </div>
  );
}

export { TeamChip };
export type { TeamChipProps };
export { Shield };
