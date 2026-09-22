import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/*
  ArenaBanner — the slanted pennant seen behind the trophy in the hero,
  typically used to label a section ("Teams", "Players", "Live"). Renders
  as an inline span or block element. Text inherits currentColor so it
  matches the surrounding theme.

  Sizes:
    - default: hero scale, 18px slant — the landing and sign-in pennants
    - sm: one station header, 10px slant — the Setup console names the
      active station with a single pennant per viewport
*/
const arenaBannerVariants = cva(
  "arena-banner inline-flex items-center gap-3 font-display font-semibold text-foreground uppercase",
  {
    variants: {
      size: {
        default: "px-6 py-3 text-base tracking-[0.32em]",
        sm: "px-4 py-1.5 text-sm tracking-[0.22em] [--banner-slant:10px]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

type ArenaBannerProps = React.ComponentProps<"span"> &
  VariantProps<typeof arenaBannerVariants>;

function ArenaBanner({ className, size, ...props }: ArenaBannerProps) {
  return (
    <span
      data-slot="arena-banner"
      data-size={size ?? "default"}
      className={cn(arenaBannerVariants({ size }), className)}
      {...props}
    />
  );
}

export { ArenaBanner, arenaBannerVariants };
export type { ArenaBannerProps };
