"use client";

import {
  Coins,
  Crown,
  Hash,
  Layers,
  Shield,
  Sparkles,
  Tag,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LiveCustomFieldValue, LivePlayerDetails } from "@/domain/live";
import { formatCredits } from "./live-theme";

interface LivePlayerDetailsDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  player: LivePlayerDetails | null;
}

/**
 * Splits comma-separated custom field values into clean, distinct badge items.
 * Trims extra whitespace and filters empty items.
 */
export function parseCustomFieldValues(value: string): string[] {
  if (!value) return [];
  if (!value.includes(",")) {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Verifies that a field is not a phone or mobile number to uphold privacy.
 */
function isMobileField(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return (
    normalized.includes("phone") ||
    normalized.includes("mobile") ||
    normalized.includes("cell") ||
    normalized.includes("whatsapp") ||
    normalized.includes("contact number")
  );
}

export function LivePlayerDetailsDialog({
  onOpenChange,
  open,
  player,
}: LivePlayerDetailsDialogProps) {
  if (!player) return null;

  // Filter out any custom fields containing mobile or phone numbers
  const safeCustomFields: LiveCustomFieldValue[] = (player.customFields ?? []).filter(
    (field) => !isMobileField(field.label),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl">
        {/* Header Hero Banner with Accent Glow */}
        <div className="relative bg-gradient-to-b from-muted/50 to-transparent p-6 pb-4 border-b border-border/50 pr-12">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Player Avatar Initial with Team/Neon Accent */}
            <div
              className="flex size-14 sm:size-16 items-center justify-center rounded-2xl font-display text-2xl font-black shrink-0 shadow-md transition-all"
              style={{
                backgroundColor: player.teamColor
                  ? `${player.teamColor}22`
                  : "rgba(var(--primary), 0.15)",
                borderColor: player.teamColor
                  ? `${player.teamColor}70`
                  : "var(--primary)",
                borderWidth: "2px",
                color: player.teamColor ? player.teamColor : "var(--primary)",
              }}
            >
              {player.displayName.charAt(0).toUpperCase()}
            </div>

            <div className="flex flex-col min-w-0">
              <DialogHeader className="gap-0.5 text-left">
                <DialogTitle className="text-xl sm:text-2xl font-display font-extrabold tracking-tight text-foreground truncate">
                  {player.displayName}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Player Profile & Bidding Attributes
                </DialogDescription>
              </DialogHeader>

              {/* Primary Badges Strip */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {player.tierLabel && (
                  <Badge variant="neon" className="text-[10px] font-bold">
                    <Layers className="size-2.5 mr-0.5" />
                    {player.tierLabel}
                  </Badge>
                )}
                {player.role && (
                  <Badge variant="secondary" className="text-[10px] font-medium">
                    <Tag className="size-2.5 mr-0.5" />
                    {player.role}
                  </Badge>
                )}
                {player.isRepresentative && (
                  <Badge variant="outline" className="text-[10px] font-semibold text-primary border-primary/40 bg-primary/10">
                    <Crown className="size-2.5 mr-0.5 text-primary" />
                    Team Rep
                  </Badge>
                )}
                {player.teamName && (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-semibold"
                    style={{
                      borderColor: player.teamColor ? `${player.teamColor}60` : undefined,
                      color: player.teamColor ?? undefined,
                    }}
                  >
                    <Shield className="size-2.5 mr-0.5" />
                    {player.teamName}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 pt-4 flex flex-col gap-5 max-h-[65vh] overflow-y-auto">
          {/* Key Player Specs Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {player.startingPrice !== null && (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Coins className="size-3 text-muted-foreground" /> Starting Price
                </span>
                <span className="font-mono text-base font-bold text-foreground tabular-nums">
                  {formatCredits(player.startingPrice)} cr
                </span>
              </div>
            )}

            {player.externalPlayerId ? (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Hash className="size-3 text-muted-foreground" /> In-Game / External ID
                </span>
                <span className="font-mono text-sm font-semibold text-foreground truncate">
                  {player.externalPlayerId}
                </span>
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <User className="size-3 text-muted-foreground" /> Role
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {player.role ?? "General Player"}
                </span>
              </div>
            )}
          </div>

          {/* Custom Fields Section (with Comma-Separated Values Rendered as Badges) */}
          <div className="flex flex-col gap-3 border-t border-border/50 pt-4">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="size-3.5 text-neon" />
              <span>Attributes & Custom Fields</span>
            </div>

            {safeCustomFields.length === 0 ? (
              <p className="text-xs text-muted-foreground/80 italic py-2">
                No additional custom attributes specified for this player.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {safeCustomFields.map((field, index) => {
                  const values = parseCustomFieldValues(field.value);
                  const isMultiBadge = values.length > 1 || field.value.includes(",");

                  return (
                    <div
                      key={field.id ?? index}
                      className="rounded-xl border border-border/50 bg-muted/15 p-3 flex flex-col gap-1.5 transition-colors"
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        {field.label}
                      </span>

                      {/* If comma-separated value, show values as badges */}
                      {isMultiBadge ? (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {values.map((item, valIdx) => (
                            <Badge
                              key={valIdx}
                              variant="secondary"
                              className="rounded-lg border border-border/60 bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground tracking-tight shadow-2xs hover:bg-muted"
                            >
                              {item}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <div className="pt-0.5">
                          <span className="inline-flex items-center rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground">
                            {field.value}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/50 bg-muted/20 px-6 py-3 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs font-semibold px-4"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
