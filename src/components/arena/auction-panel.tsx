import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/*
  AuctionPanel — the glassy neon-rimmed rectangle that frames every
  live auction surface in TournyHub. It maps directly to the panels
  drawn around the player list and team list in the arena background.
  Variants:
    - default: arena-glow with neon rim — used by the active Player card
    - glass: arena-panel only — used by side panels like BidConsole
    - trophy: trophy rim with warning accent — used by completed Auctions
*/
const auctionPanelVariants = cva("relative rounded-xl text-card-foreground", {
  variants: {
    tone: {
      default:
        "arena-glow [&_[data-slot=auction-panel-header]]:border-b [&_[data-slot=auction-panel-header]]:border-neon/20",
      glass: "arena-panel",
      trophy:
        "border border-warning/30 bg-gradient-to-b from-warning/10 to-card/80 shadow-[0_0_28px_-12px_color-mix(in_oklab,var(--warning)_70%,transparent)] backdrop-blur-sm",
      spotlight:
        "border border-neon/40 bg-spotlight text-spotlight-foreground shadow-[var(--shadow-arena-trophy)] [&_[data-slot=auction-panel-header]]:border-b [&_[data-slot=auction-panel-header]]:border-neon/30",
    },
    size: {
      sm: "p-3",
      default: "p-4",
      lg: "p-6",
    },
  },
  defaultVariants: {
    tone: "default",
    size: "default",
  },
});

type AuctionPanelProps = React.ComponentProps<"div"> &
  VariantProps<typeof auctionPanelVariants> & {
    label?: string;
  };

function AuctionPanel({
  className,
  tone,
  size,
  label,
  children,
  ...props
}: AuctionPanelProps) {
  return (
    <div
      data-slot="auction-panel"
      data-tone={tone}
      className={cn(auctionPanelVariants({ tone, size }), className)}
      {...props}
    >
      {label ? (
        <div
          data-slot="auction-panel-header"
          className="mb-3 flex items-center justify-between border-b border-current/10 pb-2"
        >
          <span className="text-xs font-semibold tracking-[0.18em] uppercase">
            {label}
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function AuctionPanelHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="auction-panel-header"
      className={cn(
        "flex items-center justify-between border-b border-current/10 pb-3",
        className,
      )}
      {...props}
    />
  );
}

function AuctionPanelTitle({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="auction-panel-title"
      className={cn(
        "font-display text-sm font-semibold tracking-[0.18em] uppercase",
        className,
      )}
      {...props}
    />
  );
}

function AuctionPanelBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="auction-panel-body"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  );
}

export {
  AuctionPanel,
  AuctionPanelHeader,
  AuctionPanelTitle,
  AuctionPanelBody,
  auctionPanelVariants,
};
