import * as React from "react";
import { cn } from "cn";

/*
  StatStrip — the monospace readout row an Organizer scans instead of prose.
  Each Stat is a micro-label plus its value in tabular figures, so the facts
  about a Draft sit in one lane and can be compared at a glance.

  Facts belong here; explanations do not. Anything that needs a sentence
  belongs beside the control it constrains, not under a title.
*/
function StatStrip({ className, ...props }: React.ComponentProps<"dl">) {
  return (
    <dl
      data-slot="stat-strip"
      className={cn(
        "flex flex-wrap items-baseline gap-x-5 gap-y-1.5",
        className,
      )}
      {...props}
    />
  );
}

function Stat({
  className,
  label,
  value,
  ...props
}: React.ComponentProps<"div"> & { label: string; value: React.ReactNode }) {
  return (
    <div
      data-slot="stat"
      className={cn("flex items-baseline gap-1.5", className)}
      {...props}
    >
      <dt className="text-[0.7rem] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="font-mono text-xs text-foreground tabular-nums">
        {value}
      </dd>
    </div>
  );
}

export { Stat, StatStrip };
