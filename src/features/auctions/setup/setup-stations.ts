import type { StationLampState } from "@/components/arena";
import type { Readiness, ReadinessGroup } from "@/domain/readiness";
import type { RulesMode } from "@/domain/auction";

/**
 * The Setup stations, in the order an Organizer works them. Tiers only exist
 * under Tiered Rules, so the rail is derived per Auction rather than fixed.
 */
const SETUP_SECTIONS = [
  { label: "Basics", slug: "basics" },
  { label: "Players", slug: "players" },
  { label: "Teams", slug: "teams" },
  { label: "Representatives", slug: "representatives" },
  { label: "Rules", slug: "rules" },
  { label: "Tiers", slug: "tiers", tieredOnly: true },
  { label: "Readiness", slug: "readiness" },
] as const;

/**
 * Which station repairs each Readiness group. Readiness already reports the
 * section that owns an issue, so the rail never guesses: it counts.
 */
const GROUP_STATION: Record<ReadinessGroup, string> = {
  feasibility: "readiness",
  invitations: "representatives",
  players: "players",
  rules: "rules",
  teams: "teams",
  tiers: "tiers",
};

/** The one group that means no Legal Completion exists at all. */
const BLOCKING_GROUP: ReadinessGroup = "feasibility";

/** The station that reports the whole gate rather than requirements it owns. */
const GATE_STATION = "readiness";

export interface SetupStation {
  href: string;
  label: string;
  /** Unresolved Readiness requirements owned by this station. */
  outstanding: number;
  state: StationLampState;
}

export function buildSetupStations({
  auctionId,
  readiness,
  rulesMode,
}: {
  auctionId: string;
  /** Null when Readiness could not be derived, so no lamp may claim anything. */
  readiness: null | Readiness;
  rulesMode: RulesMode;
}): SetupStation[] {
  const outstandingByStation = new Map<string, number>();
  const blockedStations = new Set<string>();

  for (const issue of readiness?.errors ?? []) {
    const station = GROUP_STATION[issue.group];
    outstandingByStation.set(
      station,
      (outstandingByStation.get(station) ?? 0) + 1,
    );
    if (issue.group === BLOCKING_GROUP) blockedStations.add(station);
  }

  return SETUP_SECTIONS.filter(
    (section) => !("tieredOnly" in section) || rulesMode === "tiered",
  ).map((section) => {
    const owned = outstandingByStation.get(section.slug) ?? 0;

    /*
      Readiness owns no requirements of its own: it reports whether the
      Auction can start. Its lamp therefore reads the whole gate, so a rail
      cannot show a satisfied Readiness station beside four open ones.
    */
    if (section.slug === GATE_STATION) {
      return {
        href: `/app/auctions/${auctionId}/setup/${section.slug}`,
        label: section.label,
        outstanding: owned,
        state:
          readiness === null
            ? "unknown"
            : readiness.ready
              ? "clear"
              : blockedStations.has(section.slug)
                ? "blocked"
                : "pending",
      };
    }

    const state: StationLampState =
      readiness === null
        ? "unknown"
        : blockedStations.has(section.slug)
          ? "blocked"
          : owned > 0
            ? "pending"
            : "clear";

    return {
      href: `/app/auctions/${auctionId}/setup/${section.slug}`,
      label: section.label,
      outstanding: owned,
      state,
    };
  });
}
