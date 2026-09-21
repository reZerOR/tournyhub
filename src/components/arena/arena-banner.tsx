import * as React from "react";
import { cn } from "cn";

/*
  ArenaBanner — the slanted pennant seen behind the trophy in the hero,
  typically used to label a section ("Teams", "Players", "Live"). Renders
  as an inline span or block element. Text inherits currentColor so it
  matches the surrounding theme.
*/
type ArenaBannerProps = {
  children: React.ReactNode;
  className?: string;
};

function ArenaBanner({ children, className }: ArenaBannerProps) {
  return (
    <span
      data-slot="arena-banner"
      className={cn(
        "arena-banner inline-flex items-center gap-3 px-6 py-3 font-display text-base font-semibold tracking-[0.32em] text-foreground uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

export { ArenaBanner };
export type { ArenaBannerProps };
