import * as React from "react";
import { cn } from "cn";

/*
  Trophy — the central emblem of the arena, drawn in SVG to scale with
  size and inherit currentColor. Used as the centerpiece of the home page
  hero, the completed-auction Results screen, and as the platform mark on
  the sign-in page.
*/
type TrophyProps = {
  size?: number;
  className?: string;
  title?: string;
};

function Trophy({ size = 96, className, title }: TrophyProps) {
  return (
    <svg
      data-slot="trophy"
      role={title ? "img" : "presentation"}
      aria-label={title}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      className={cn("text-neon", className)}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id="trophy-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {/* Crown */}
      <path
        d="M32 18 L48 8 L64 18 L60 26 L48 22 L36 26 Z"
        fill="url(#trophy-gold)"
      />
      {/* Goblet body */}
      <path
        d="M30 28 H66 V48 C66 60 58 70 48 72 C38 70 30 60 30 48 Z"
        fill="url(#trophy-gold)"
        stroke="currentColor"
        strokeOpacity="0.4"
      />
      {/* Handles */}
      <path
        d="M30 32 C18 32 16 48 30 50"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="2.5"
        fill="none"
      />
      <path
        d="M66 32 C78 32 80 48 66 50"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="2.5"
        fill="none"
      />
      {/* Stem */}
      <rect
        x="44"
        y="72"
        width="8"
        height="10"
        fill="currentColor"
        fillOpacity="0.7"
      />
      {/* Base */}
      <rect
        x="32"
        y="82"
        width="32"
        height="6"
        rx="2"
        fill="currentColor"
        fillOpacity="0.85"
      />
    </svg>
  );
}

export { Trophy };
export type { TrophyProps };
