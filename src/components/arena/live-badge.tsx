import * as React from "react";
import { Radio } from "lucide-react";
import { cn } from "cn";

/*
  LiveBadge — the small "LIVE" indicator that pulses next to the active
  auction name and in the live console header. Communicates "bidding is
  open" without reading the page.
*/
type LiveBadgeProps = {
  className?: string;
  label?: string;
};

function LiveBadge({ className, label = "Live" }: LiveBadgeProps) {
  return (
    <span
      data-slot="live-badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-neon/50 bg-neon/15 px-2.5 py-0.5 font-display text-[0.7rem] font-semibold tracking-[0.18em] text-neon uppercase",
        className,
      )}
    >
      <Radio
        data-icon="inline-start"
        aria-hidden
        className="arena-pulse size-3 rounded-full text-neon"
      />
      {label}
    </span>
  );
}

export { LiveBadge };
export type { LiveBadgeProps };
