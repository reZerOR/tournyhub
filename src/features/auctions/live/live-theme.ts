export const FALLBACK_TEAM_COLORS = [
  "#3b82f6", // Blue
  "#ef4444", // Red
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#8b5cf6", // Purple
  "#06b6d4", // Cyan
  "#ec4899", // Pink
  "#14b8a6", // Teal
  "#f97316", // Orange
  "#6366f1", // Indigo
];

export function getTeamColor(
  team: { color?: null | string; position?: number } | null | undefined,
  fallbackIndex = 0,
): string {
  if (!team) return FALLBACK_TEAM_COLORS[fallbackIndex % FALLBACK_TEAM_COLORS.length]!;
  if (team.color && team.color.trim() !== "") return team.color;
  const index = team.position !== undefined ? team.position : fallbackIndex;
  return FALLBACK_TEAM_COLORS[Math.abs(index) % FALLBACK_TEAM_COLORS.length]!;
}

export function formatCredits(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return amount.toLocaleString();
}

export function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}
