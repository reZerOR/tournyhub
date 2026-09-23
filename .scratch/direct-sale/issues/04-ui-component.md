# 04 — UI: Direct Sale tab in LiveOrganizerTools

Status: ready-for-agent
Type: frontend
Blocked by: 03

## Goal

Add a "Direct Sale" tab to `LiveOrganizerTools` (in `src/features/auctions/live/live-organizer-tools.tsx`), visible only when the auction is Paused.

## Props to add

```ts
// Add to LiveOrganizerToolsProps:
directSaleAmount: number;
directSalePlayerId: string;
directSaleTeamId: string;
onDirectSaleAmountChange: (amount: number) => void;
onDirectSalePlayerChange: (playerEntryId: string) => void;
onDirectSaleTeamChange: (teamId: string) => void;
onDirectSale: () => void;
eligiblePlayersForDirectSale: Array<{ id: string; displayName: string; tierId: string | null; startingPrice: number }>;
```

Note: `correctionReason` (already in props) is shared with the Direct Sale tab for the reason field.

## Tab definition

Add to the tab bar (inside the `{lifecycle === "paused" && ...}` guard — same as corrections tab):

```tsx
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
```

Update `activeTab` state type to include `"direct-sale"`.

## Tab content

```tsx
{activeTab === "direct-sale" && lifecycle === "paused" && (
  <div className="flex flex-col gap-4">
    {/* Shared correction reason is used */}
    <Field className="max-w-xl">
      <FieldLabel htmlFor="tools-correction-reason">Correction Reason</FieldLabel>
      <Input
        id="tools-correction-reason"
        onChange={(e) => onCorrectionReasonChange(e.target.value)}
        placeholder="Reason for audit log (required)"
        value={correctionReason}
      />
    </Field>

    <div className="flex flex-wrap items-end gap-3">
      {/* Player selector */}
      <Field className="min-w-56 flex-1">
        <FieldLabel>Player</FieldLabel>
        <Select
          items={eligiblePlayersForDirectSale.map((p) => ({
            label: p.displayName,
            value: p.id,
          }))}
          onValueChange={(val) => onDirectSalePlayerChange(val ?? "")}
          value={directSalePlayerId}
        >
          <SelectTrigger className="w-full h-9 text-xs">
            <SelectValue placeholder="Choose a Player" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {eligiblePlayersForDirectSale.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.displayName}
                  {p.tierId ? ` · ${p.startingPrice} cr` : ""}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      {/* Team selector */}
      <Field className="min-w-48 flex-1">
        <FieldLabel>Team</FieldLabel>
        <Select
          items={teams.map((t) => ({ label: t.name ?? t.id, value: t.id }))}
          onValueChange={(val) => onDirectSaleTeamChange(val ?? "")}
          value={directSaleTeamId}
        >
          <SelectTrigger className="w-full h-9 text-xs">
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

      {/* Amount */}
      <Field className="w-36">
        <FieldLabel>Credits</FieldLabel>
        <Input
          className="h-9 text-xs"
          min={1}
          onChange={(e) => onDirectSaleAmountChange(Number(e.target.value))}
          placeholder="Amount"
          type="number"
          value={directSaleAmount || ""}
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
```

## Import

Add `ShoppingCart` to the existing Lucide import block.

## Done when

The tab renders when Paused, all three selects/fields work, and the button calls `onDirectSale`.
