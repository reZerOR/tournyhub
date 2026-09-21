import * as React from "react";
import { cn } from "cn";

/*
  CreditDisplay — the formatted display of a whole-number Credit amount.
  Used for Bid amounts, Budget totals, and Sale prices. Always renders
  the value in monospace with the "cr" suffix to keep it visually
  distinct from real-world currencies.
*/
type CreditDisplayProps = {
  amount: number;
  size?: "sm" | "default" | "lg" | "xl" | "display";
  className?: string;
  emphasize?: boolean;
};

const sizeClasses: Record<NonNullable<CreditDisplayProps["size"]>, string> = {
  sm: "text-sm",
  default: "text-base",
  lg: "text-lg",
  xl: "text-2xl",
  display: "text-5xl",
};

function formatCredits(amount: number) {
  return new Intl.NumberFormat("en-US").format(amount);
}

function CreditDisplay({
  amount,
  size = "default",
  emphasize,
  className,
}: CreditDisplayProps) {
  return (
    <span
      data-slot="credit-display"
      data-size={size}
      className={cn(
        "inline-flex items-baseline gap-1 font-mono tabular-nums",
        sizeClasses[size],
        emphasize && "arena-text-glow text-foreground",
        !emphasize && "text-foreground",
        className,
      )}
    >
      <span>{formatCredits(amount)}</span>
      <span className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
        cr
      </span>
    </span>
  );
}

export { CreditDisplay };
export type { CreditDisplayProps };
