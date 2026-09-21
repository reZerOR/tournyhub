import * as React from "react";
import Image from "next/image";
import { cn } from "cn";

import { Button } from "@/components/ui/button";

import { ArenaBanner } from "./arena-banner";
import { Trophy } from "./trophy";

/*
  AuctionHero — the full-bleed arena landing surface built directly on
  top of public/background.png. The image stays as the floor; the
  centered trophy and three pennant banners carry the headline copy and
  primary CTA. Use only on / and /auctions/[id]/ready.
*/
type AuctionHeroProps = {
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
  banners?: string[];
  className?: string;
};

function AuctionHero({
  title,
  subtitle,
  ctaLabel,
  onCta,
  banners = ["Teams", "Bid", "Players"],
  className,
}: AuctionHeroProps) {
  return (
    <section
      data-slot="auction-hero"
      className={cn(
        "relative isolate flex min-h-[70vh] items-center justify-center overflow-hidden rounded-2xl",
        className,
      )}
    >
      <Image
        src="/background.png"
        alt="A lit esports arena hosting a TournyHub auction"
        fill
        priority
        sizes="100vw"
        className="object-cover opacity-90"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/80"
      />

      <div className="relative z-10 flex max-w-3xl flex-col items-center gap-8 px-6 text-center">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {banners.map((banner) => (
            <ArenaBanner key={banner}>{banner}</ArenaBanner>
          ))}
        </div>

        <Trophy size={120} className="arena-pulse text-neon" />

        <h1 className="arena-text-glow font-display text-4xl font-semibold tracking-tight md:text-6xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="max-w-xl text-base text-balance text-foreground/80 md:text-lg">
            {subtitle}
          </p>
        ) : null}

        {ctaLabel ? (
          <Button variant="neon" size="xl" onClick={onCta}>
            {ctaLabel}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export { AuctionHero };
export type { AuctionHeroProps };
