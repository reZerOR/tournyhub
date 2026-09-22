"use client";

import { usePathname } from "next/navigation";
import {
  CheckCircle2,
  Layers,
  Scroll,
  Shield,
  Sliders,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { StationRail, StationRailItem } from "@/components/arena";
import type { SetupStation } from "@/features/auctions/setup/setup-stations";

const STATION_ICONS: Record<string, LucideIcon> = {
  Basics: Sliders,
  Players: Users,
  Readiness: CheckCircle2,
  Representatives: UserCheck,
  Rules: Scroll,
  Teams: Shield,
  Tiers: Layers,
};

export function SetupNav({ stations }: { stations: SetupStation[] }) {
  const pathname = usePathname();

  return (
    <StationRail>
      {stations.map((station) => {
        const Icon = STATION_ICONS[station.label];
        return (
          <StationRailItem
            active={pathname === station.href}
            href={station.href}
            icon={Icon}
            key={station.href}
            label={station.label}
            outstanding={station.outstanding}
            state={station.state}
          />
        );
      })}
    </StationRail>
  );
}
