"use client";

import { useState } from "react";
import {
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Layers,
  RotateCcw,
  ShoppingCart,
  Wrench,
} from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  LiveActivePlayer,
  LiveBidRejection,
  LiveSale,
  LiveStatus,
  LiveTeamPublicState,
  LiveTierProgress,
  LiveUnsoldRound,
  RulesMode,
} from "@/domain/live";
import { LIVE_SHORTCUTS } from "@/features/auctions/live/live-feedback";

interface LiveOrganizerToolsProps {
  activePlayer: LiveActivePlayer | null;
  activeTierId: string | null;
  correctionReason: string;
  currentBid: null | { amount: number; teamId: string };
  deficientTeamIds: string[];
  directSaleAmount: number;
  directSalePlayerId: string;
  directSaleTeamId: string;
  eligiblePlayersForDirectSale: Array<{
    displayName: string;
    id: string;
    startingPrice: number;
    tierId: null | string;
  }>;
  lifecycle: LiveStatus;
  nextTierId: string | null;
  onActivateTier: (tierId: string) => void;
  onCancelHighestBid: () => void;
  onCloseUnsoldPool: () => void;
  onCompleteAuction: () => void;
  onCorrectionReasonChange: (reason: string) => void;
  onDirectSale: () => void;
  onDirectSaleAmountChange: (amount: number) => void;
  onDirectSalePlayerChange: (playerEntryId: string) => void;
  onDirectSaleTeamChange: (teamId: string) => void;
  onRequestMatching: () => void;
  onReverseSale: (saleId: string) => void;
  onSaleIdToReverseChange: (saleId: string) => void;
  onStartUnsoldRound: () => void;
  openSales: LiveSale[];
  pending: boolean;
  rejections: LiveBidRejection[];
  revision: number;
  rulesMode: RulesMode;
  saleIdToReverse: string;
  teams: LiveTeamPublicState[];
  tiers: LiveTierProgress[];
  unsoldPoolCount: number;
  unsoldRound: LiveUnsoldRound | null;
}

export function LiveOrganizerTools({
  activePlayer,
  activeTierId,
  correctionReason,
  currentBid,
  deficientTeamIds,
  directSaleAmount,
  directSalePlayerId,
  directSaleTeamId,
  eligiblePlayersForDirectSale,
  lifecycle,
  nextTierId,
  onActivateTier,
  onCancelHighestBid,
  onCloseUnsoldPool,
  onCompleteAuction,
  onCorrectionReasonChange,
  onDirectSale,
  onDirectSaleAmountChange,
  onDirectSalePlayerChange,
  onDirectSaleTeamChange,
  onRequestMatching,
  onReverseSale,
  onSaleIdToReverseChange,
  onStartUnsoldRound,
  openSales,
  pending,
  rejections,
  rulesMode,
  saleIdToReverse,
  teams,
  tiers,
  unsoldPoolCount,
  unsoldRound,
}: LiveOrganizerToolsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"tiers" | "corrections" | "direct-sale" | "rejections" | "shortcuts">("tiers");

  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md overflow-hidden shadow-sm transition-all">
      {/* Drawer Toggle Header */}
      <button
        className="w-full px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Wrench className="size-4" />
          </div>
          <span className="font-display font-bold text-sm text-foreground">
            Organizer Administration & Controls
          </span>
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground font-mono">
            Tiers, Rounds & Corrections
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
          <span>{isOpen ? "Hide Toolkit" : "Expand Toolkit"}</span>
          {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </div>
      </button>

      {/* Expandable Content */}
      {isOpen && (
        <div className="border-t border-border/60 p-4 sm:p-6 flex flex-col gap-5">
          {/* Tab Selection */}
          <div className="flex flex-wrap gap-2 border-b border-border/50 pb-3">
            {rulesMode === "tiered" && (
              <button
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                  activeTab === "tiers"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => setActiveTab("tiers")}
                type="button"
              >
                <Layers className="size-3.5" />
                <span>Tiers & Rounds</span>
              </button>
            )}

            {lifecycle === "paused" && (
              <button
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                  activeTab === "corrections"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => setActiveTab("corrections")}
                type="button"
              >
                <RotateCcw className="size-3.5" />
                <span>Corrections & Reversals</span>
              </button>
            )}

            {lifecycle === "paused" && (
              <button
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                  activeTab === "direct-sale"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => setActiveTab("direct-sale")}
                type="button"
              >
                <ShoppingCart className="size-3.5" />
                <span>Direct Sale</span>
              </button>
            )}

            <button
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                activeTab === "rejections"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              onClick={() => setActiveTab("rejections")}
              type="button"
            >
              <AlertOctagon className="size-3.5" />
              <span>Rejected Bids ({rejections.length})</span>
            </button>

            <button
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                activeTab === "shortcuts"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              onClick={() => setActiveTab("shortcuts")}
              type="button"
            >
              <HelpCircle className="size-3.5" />
              <span>Shortcuts</span>
            </button>

            {lifecycle === "paused" && (
              <Button
                className="ml-auto"
                disabled={pending || !!activePlayer || unsoldPoolCount > 0}
                onClick={onCompleteAuction}
                size="sm"
                type="button"
                variant="destructive"
              >
                Complete Auction Permanently
              </Button>
            )}
          </div>

          {/* Tiers & Unsold Rounds Tab */}
          {activeTab === "tiers" && rulesMode === "tiered" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {tiers.map((tier) => (
                  <div
                    className={cn(
                      "rounded-xl border p-3 flex flex-col gap-1.5 transition-colors",
                      tier.isActive
                        ? "border-neon/40 bg-neon/10"
                        : tier.complete
                          ? "border-border/40 bg-muted/20 opacity-70"
                          : "border-border/60 bg-muted/30",
                    )}
                    key={tier.id}
                  >
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className={tier.isActive ? "text-neon" : "text-foreground"}>
                        {tier.label} {tier.isActive && "(Active)"}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {tier.offeredCount}/{tier.biddableCount}
                      </span>
                    </div>

                    <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          tier.complete ? "bg-emerald-500" : tier.isActive ? "bg-neon" : "bg-muted-foreground",
                        )}
                        style={{
                          width: `${tier.biddableCount > 0 ? (tier.offeredCount / tier.biddableCount) * 100 : 0}%`,
                        }}
                      />
                    </div>

                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Starting: {tier.startingPrice} cr</span>
                      <span>{tier.complete ? "Complete" : "In Progress"}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Buttons for Tiers & Rounds */}
              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  disabled={pending || !nextTierId || nextTierId === activeTierId || !!activePlayer}
                  onClick={() => nextTierId && onActivateTier(nextTierId)}
                  size="sm"
                  type="button"
                >
                  Activate Next Tier
                </Button>

                <Button
                  disabled={pending || !!unsoldRound || !!activePlayer}
                  onClick={onStartUnsoldRound}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Start Unsold Round
                </Button>

                <Button
                  disabled={pending || !unsoldRound || !!activePlayer}
                  onClick={onCloseUnsoldPool}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Close Unsold Pool
                </Button>

                <Button
                  disabled={pending || !unsoldRound || !!activePlayer || deficientTeamIds.length === 0}
                  onClick={onRequestMatching}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Request Constrained Matching
                </Button>
              </div>

              {unsoldRound && (
                <p className="text-xs text-muted-foreground">
                  Unsold Round {unsoldRound.sequence}: {unsoldRound.eligibleCount} eligible,{" "}
                  {unsoldRound.offeredCount} offered.
                </p>
              )}
            </div>
          )}

          {/* Corrections Tab (when Paused) */}
          {activeTab === "corrections" && lifecycle === "paused" && (
            <div className="flex flex-col gap-4">
              <Field className="max-w-xl">
                <FieldLabel htmlFor="tools-correction-reason">Correction Reason</FieldLabel>
                <Input
                  id="tools-correction-reason"
                  onChange={(e) => onCorrectionReasonChange(e.target.value)}
                  placeholder="Reason for audit log (required for corrections)"
                  value={correctionReason}
                />
              </Field>

              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={pending || !correctionReason.trim() || !currentBid || !activePlayer}
                  onClick={onCancelHighestBid}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Cancel Highest Bid
                </Button>
              </div>

              <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-border/40">
                <Field className="min-w-64 max-w-md flex-1">
                  <FieldLabel htmlFor="tools-reverse-sale">Sale to Reverse</FieldLabel>
                  <Select
                    items={openSales.map((sale) => ({
                      label: `${sale.playerDisplayName} · ${sale.amount} cr${sale.source === "forced" ? " (Forced)" : sale.source === "direct" ? " (Direct)" : ""}`,
                      value: sale.saleId,
                    }))}
                    onValueChange={(val) => onSaleIdToReverseChange(val ?? "")}
                    value={saleIdToReverse}
                  >
                    <SelectTrigger className="w-full h-9 text-xs" id="tools-reverse-sale">
                      <SelectValue placeholder="Choose a completed Sale">
                        {(val: string | null) => {
                          const sale = openSales.find((s) => s.saleId === val);
                          return sale
                            ? `${sale.playerDisplayName} · ${sale.amount} cr${sale.source === "forced" ? " (Forced)" : ""}`
                            : (val ?? undefined);
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {openSales.map((sale) => (
                          <SelectItem key={sale.saleId} value={sale.saleId}>
                            {sale.playerDisplayName} · {sale.amount} cr
                            {sale.source === "forced" ? " (Forced)" : ""}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Button
                  disabled={pending || !correctionReason.trim() || !saleIdToReverse}
                  onClick={() => onReverseSale(saleIdToReverse)}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  Reverse Sale
                </Button>
              </div>
            </div>
          )}

          {/* Direct Sale Tab */}
          {activeTab === "direct-sale" && lifecycle === "paused" && (
            <div className="flex flex-col gap-4">
              <Field className="max-w-xl">
                <FieldLabel htmlFor="tools-direct-sale-reason">
                  Correction Reason
                </FieldLabel>
                <Input
                  id="tools-direct-sale-reason"
                  onChange={(e) => onCorrectionReasonChange(e.target.value)}
                  placeholder="Reason for audit log (required)"
                  value={correctionReason}
                />
              </Field>

              <div className="flex flex-wrap items-end gap-3">
                {/* Player selector */}
                <Field className="min-w-56 flex-1">
                  <FieldLabel htmlFor="tools-direct-sale-player">
                    Player
                  </FieldLabel>
                  <Select
                    items={eligiblePlayersForDirectSale.map((p) => ({
                      label: p.displayName,
                      value: p.id,
                    }))}
                    onValueChange={(val) =>
                      onDirectSalePlayerChange(val ?? "")
                    }
                    value={directSalePlayerId}
                  >
                    <SelectTrigger
                      className="w-full h-9 text-xs"
                      id="tools-direct-sale-player"
                    >
                      <SelectValue placeholder="Choose a Player" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {eligiblePlayersForDirectSale.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.displayName}
                            {p.tierId
                              ? ` · ${p.startingPrice} cr`
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                {/* Team selector */}
                <Field className="min-w-48 flex-1">
                  <FieldLabel htmlFor="tools-direct-sale-team">
                    Team
                  </FieldLabel>
                  <Select
                    items={teams.map((t) => ({
                      label: t.name ?? t.id,
                      value: t.id,
                    }))}
                    onValueChange={(val) =>
                      onDirectSaleTeamChange(val ?? "")
                    }
                    value={directSaleTeamId}
                  >
                    <SelectTrigger
                      className="w-full h-9 text-xs"
                      id="tools-direct-sale-team"
                    >
                      <SelectValue placeholder="Choose a Team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name ?? t.id} · {t.remainingBudget} cr left
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                {/* Credit amount */}
                <Field className="w-36">
                  <FieldLabel htmlFor="tools-direct-sale-amount">
                    Credits
                  </FieldLabel>
                  <Input
                    className="h-9 text-xs"
                    id="tools-direct-sale-amount"
                    min={1}
                    onChange={(e) =>
                      onDirectSaleAmountChange(Number(e.target.value))
                    }
                    placeholder="Amount"
                    type="number"
                    value={directSaleAmount > 0 ? directSaleAmount : ""}
                  />
                </Field>

                <Button
                  disabled={
                    pending ||
                    !correctionReason.trim() ||
                    !directSalePlayerId ||
                    !directSaleTeamId ||
                    directSaleAmount < 1
                  }
                  onClick={onDirectSale}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  Confirm Direct Sale
                </Button>
              </div>
            </div>
          )}

          {/* Rejected Bids Log Tab */}
          {activeTab === "rejections" && (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">
                Recent rejected bids (visible only to the Organizer and submitting team):
              </span>
              {rejections.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs">
                  {rejections.map((rejection, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-1.5 font-mono"
                    >
                      <span className="font-bold text-destructive">
                        {rejection.amount} cr
                      </span>
                      <span className="text-muted-foreground">
                        {rejection.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground italic py-3">
                  No bids have been rejected.
                </p>
              )}
            </div>
          )}

          {/* Shortcuts Tab */}
          {activeTab === "shortcuts" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {LIVE_SHORTCUTS.map((shortcut) => (
                <div
                  key={shortcut.action}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-2.5 text-xs"
                >
                  <span className="text-muted-foreground">{shortcut.description}</span>
                  <kbd className="rounded border bg-background px-2 py-0.5 font-mono text-[11px] font-bold shadow-xs">
                    {shortcut.key.toUpperCase()}
                  </kbd>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
