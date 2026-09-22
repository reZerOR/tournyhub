import * as React from "react";
import { cn } from "cn";


/*
  StationPlate — one station of the Setup console. The pennant names the
  station, the monospace readout on the right carries its live count, and
  the optional footer holds the station's own action.

  A plate is the console's only container: sub-sections inside it are
  divided by hairline rules (StationGroup), never by another box.

  Variants:
    - station: the station the Organizer is standing on. One per viewport,
      and the only plate that wears the pennant.
    - section: a second plate on the same viewport (an editor, an import, a
      calculator). It takes the quiet tracked label instead, so the pennant
      keeps meaning "this is the station you are on".
*/
type StationPlateProps = React.ComponentProps<"section"> & {
  label: string;
  /** Monospace readout shown at the right of the station header. */
  stat?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: "section" | "station";
};

function StationPlate({
  children,
  className,
  footer,
  label,
  stat,
  variant = "station",
  ...props
}: StationPlateProps) {
  return (
    <section
      data-slot="station-plate"
      data-variant={variant}
      className={cn(
        "dashboard-panel flex flex-col overflow-hidden rounded-xl",
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-x-4 border-b border-border/70 px-4 py-3 sm:px-5">
        {variant === "station" ? (
          <h2 className="min-w-0 font-heading text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {label}
          </h2>
        ) : (
          <h2 className="min-w-0 truncate text-sm font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            {label}
          </h2>
        )}
        {stat ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground tabular-nums">
            {stat}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-5 px-4 py-4 sm:px-5 sm:py-5">
        {children}
      </div>

      {footer ? (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/70 bg-muted/25 px-4 py-3 sm:px-5">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

/*
  StationGroup — a named division inside a plate. Divided by a hairline rule
  rather than a nested box, so a plate stays one surface. The hint is one
  line of monospace beside the label: a fact about the control, never a
  sentence under it.
*/
function StationGroup({
  children,
  className,
  hint,
  label,
  ...props
}: React.ComponentProps<"section"> & {
  label: string;
  hint?: React.ReactNode;
}) {
  return (
    <section
      data-slot="station-group"
      className={cn(
        "flex flex-col gap-3 border-t border-border/60 pt-5 first:border-t-0 first:pt-0",
        className,
      )}
      {...props}
    >
      <div className="flex items-baseline justify-between gap-x-3">
        <h3 className="shrink-0 text-[0.7rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          {label}
        </h3>
        {hint ? (
          <span className="min-w-0 truncate text-right font-mono text-xs text-muted-foreground tabular-nums">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export { StationGroup, StationPlate };
export type { StationPlateProps };
