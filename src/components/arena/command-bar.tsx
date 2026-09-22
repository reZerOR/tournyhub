import * as React from "react";
import { cn } from "cn";

/*
  CommandBar — the bar an Operate surface keeps pinned to the bottom of its
  working column. It carries the surface's one highest-stakes action and the
  state that action depends on, so the Organizer never has to hunt for it.

  It deliberately does not wear the plate material: the plates are the work,
  this is the gate the work feeds. The arena divider along its top edge is the
  whole difference, so the lever sits on something the plates are not.

  It is also not a live region: a page that asserts on its own `role="status"`
  must stay the only one announcing state.
*/
function CommandBar({
  children,
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-bar"
      className={cn(
        "relative sticky bottom-3 z-30 mt-auto flex flex-wrap items-center justify-between gap-x-5 gap-y-2 rounded-xl border border-neon/25 bg-background/85 px-4 py-3 backdrop-blur-xl",
        "shadow-[0_18px_40px_-28px_color-mix(in_oklab,var(--spotlight)_95%,transparent)]",
        className,
      )}
      {...props}
    >
      <div aria-hidden className="arena-divider absolute inset-x-5 top-0" />
      {children}
    </div>
  );
}

export { CommandBar };
