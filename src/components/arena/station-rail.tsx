import * as React from "react";
import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { cn } from "cn";

/*
  StationRail — the ordered list of stations a surface is worked through.
  Presented as a tab-like navigation bar. Each tab carries a readiness lamp,
  so the tab rail doubles as the object's progress map: the same Readiness engine
  that gates an Auction also lights these tabs.
*/
type StationLampState = "blocked" | "clear" | "pending" | "unknown";

function StationLamp({
  className,
  state = "clear",
}: {
  className?: string;
  state?: StationLampState;
}) {
  return (
    <span
      aria-hidden
      data-slot="station-lamp"
      data-state={state}
      className={cn(
        "size-2 shrink-0 rounded-[2px] ring-1 transition-colors ring-inset",
        state === "clear" &&
          "bg-roster/90 shadow-[0_0_10px_-2px_color-mix(in_oklab,var(--roster)_75%,transparent)] ring-roster/40",
        state === "pending" && "bg-warning/90 ring-warning/40",
        state === "blocked" && "bg-destructive ring-destructive/50",
        state === "unknown" && "bg-muted-foreground/25 ring-transparent",
        className,
      )}
    />
  );
}

function StationRail({
  children,
  className,
  ...props
}: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="Auction setup tabs"
      data-slot="station-rail"
      className={cn("w-full overflow-x-auto", className)}
      {...props}
    >
      <ul className="inline-flex min-w-full items-center gap-1.5 rounded-xl border border-border/70 bg-card/60 p-1.5 backdrop-blur-md sm:w-auto">
        {children}
      </ul>
    </nav>
  );
}

type StationRailItemProps = {
  active?: boolean;
  href: string;
  icon?: LucideIcon;
  label: string;
  /** Unresolved Readiness requirements owned by this station. */
  outstanding?: number;
  state?: StationLampState;
};

function StationRailItem({
  active = false,
  href,
  icon: Icon,
  label,
  outstanding = 0,
  state = "clear",
}: StationRailItemProps) {
  return (
    <li className="relative shrink-0">
      <Link
        aria-current={active ? "page" : undefined}
        href={href}
        className={cn(
          "relative inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-all whitespace-nowrap",
          active
            ? "bg-neon/15 text-foreground shadow-sm ring-1 ring-neon/40 font-semibold"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        <StationLamp state={state} />
        {Icon && (
          <Icon
            aria-hidden
            className={cn(
              "size-4 shrink-0 transition-colors",
              active ? "text-neon" : "text-muted-foreground",
            )}
          />
        )}
        <span>{label}</span>
        {outstanding > 0 ? (
          <span
            className={cn(
              "ml-1 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none tabular-nums",
              active
                ? "bg-neon/20 text-neon"
                : "bg-muted text-muted-foreground",
            )}
          >
            {outstanding}
            <span className="sr-only">
              requirement{outstanding === 1 ? "" : "s"} open
            </span>
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export { StationLamp, StationRail, StationRailItem };
export type { StationLampState, StationRailItemProps };
