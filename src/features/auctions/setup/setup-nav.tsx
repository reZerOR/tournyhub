"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "cn";

const SETUP_SECTIONS = [
  { label: "Basics", slug: "basics" },
  { label: "Players", slug: "players" },
  { label: "Teams", slug: "teams" },
  { label: "Representatives", slug: "representatives" },
  { label: "Rules", slug: "rules" },
  { label: "Readiness", slug: "readiness" },
] as const;

export function SetupNav({ auctionId }: { auctionId: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Auction setup" className="flex flex-col gap-1">
      {SETUP_SECTIONS.map((section) => {
        const href = `/app/auctions/${auctionId}/setup/${section.slug}`;
        const isActive = pathname === href;
        return (
          <Link
            key={section.slug}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              isActive && "bg-muted text-foreground",
            )}
            href={href}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
