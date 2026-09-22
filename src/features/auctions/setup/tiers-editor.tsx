"use client";

import { ArrowDown, ArrowUp, Check, Pencil, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";

import { StationGroup, StationPlate } from "@/components/arena";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isMustHaveTier } from "@/domain/tier";
import {
  assignMultiplePlayerTiersAction,
  assignPlayerTierAction,
  createTierAction,
  deleteTierAction,
  moveTierAction,
  updateTierAction,
} from "@/features/auctions/setup/tier-actions";
import { TierAssignmentsTable } from "@/features/auctions/setup/tier-assignments-table";
import {
  SaveReadout,
  type SaveState,
} from "@/features/auctions/setup/save-readout";

import type {
  SerializedTier,
  SerializedTierAssignment,
} from "@/features/auctions/setup/serialize-team";
import { cn } from "cn";

interface TierDraft {
  label: string;
  maxPerTeam: string;
  minPerTeam: string;
  mode: "must-have" | "range";
  mustHaveCount: string;
  startingPrice: string;
}

const EMPTY_TIER: TierDraft = {
  label: "",
  maxPerTeam: "1",
  minPerTeam: "0",
  mode: "range",
  mustHaveCount: "1",
  startingPrice: "",
};

function toDraft(tier: SerializedTier): TierDraft {
  const isMustHave = isMustHaveTier(tier);
  return {
    label: tier.label,
    maxPerTeam: String(tier.maxPerTeam),
    minPerTeam: String(tier.minPerTeam),
    mode: isMustHave ? "must-have" : "range",
    mustHaveCount: String(isMustHave ? tier.minPerTeam : 1),
    startingPrice: String(tier.startingPrice),
  };
}

/*
  The ordered Tier fields are laid out with a mode toggle (Range vs Must-Have),
  name, starting price, and quota counts. Fully mobile-friendly.
*/
function TierFields({
  draft,
  idPrefix,
  nameLabel = "Tier name",
  onChange,
}: {
  draft: TierDraft;
  idPrefix: string;
  nameLabel?: string;
  onChange: (update: (previous: TierDraft) => TierDraft) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Quota Mode
        </span>
        <div
          aria-label="Quota Mode"
          className="grid grid-cols-1 gap-1.5 rounded-lg border border-border/80 bg-muted/60 p-1 sm:grid-cols-2"
          role="radiogroup"
        >
          <button
            aria-checked={draft.mode === "range"}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all cursor-pointer text-center",
              draft.mode === "range"
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
            )}
            onClick={() => {
              onChange((previous) => ({
                ...previous,
                maxPerTeam:
                  previous.mustHaveCount || previous.maxPerTeam || "1",
                minPerTeam: "0",
                mode: "range",
              }));
            }}
            role="radio"
            type="button"
          >
            {draft.mode === "range" && (
              <Check aria-hidden className="size-3.5 stroke-[2.5]" />
            )}
            Range (Min / Max)
          </button>
          <button
            aria-checked={draft.mode === "must-have"}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all cursor-pointer text-center",
              draft.mode === "must-have"
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
            )}
            onClick={() => {
              const count =
                draft.mustHaveCount ||
                (draft.maxPerTeam !== "0" && draft.maxPerTeam
                  ? draft.maxPerTeam
                  : "1");
              onChange((previous) => ({
                ...previous,
                maxPerTeam: count,
                minPerTeam: count,
                mode: "must-have",
                mustHaveCount: count,
              }));
            }}
            role="radio"
            type="button"
          >
            {draft.mode === "must-have" && (
              <Check aria-hidden className="size-3.5 stroke-[2.5]" />
            )}
            Must-Have (Exact per Team)
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {draft.mode === "must-have"
            ? "Every Team must acquire exactly this many Players (Min = Max). Tier capacity is capped to Teams × Must-Have."
            : "Teams can acquire anywhere between the Min and Max count of Players from this Tier."}
        </p>
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={`${idPrefix}-label`}>{nameLabel}</FieldLabel>
          <Input
            id={`${idPrefix}-label`}
            onChange={(event) =>
              onChange((previous) => ({
                ...previous,
                label: event.target.value,
              }))
            }
            placeholder="e.g. Diamond, Tier 1, S Tier"
            value={draft.label}
          />
        </Field>
        <Field
          className={
            draft.mode === "must-have" ? "col-span-1" : "sm:col-span-2"
          }
        >
          <FieldLabel htmlFor={`${idPrefix}-price`}>Starting Price</FieldLabel>
          <Input
            className="font-mono tabular-nums"
            id={`${idPrefix}-price`}
            inputMode="numeric"
            onChange={(event) =>
              onChange((previous) => ({
                ...previous,
                startingPrice: event.target.value,
              }))
            }
            placeholder="e.g. 1000"
            value={draft.startingPrice}
          />
        </Field>
        {draft.mode === "must-have" ? (
          <Field className="col-span-1">
            <FieldLabel htmlFor={`${idPrefix}-must-have`}>
              Must Have per Team
            </FieldLabel>
            <Input
              className="font-mono tabular-nums"
              id={`${idPrefix}-must-have`}
              inputMode="numeric"
              onChange={(event) => {
                const val = event.target.value;
                onChange((previous) => ({
                  ...previous,
                  maxPerTeam: val,
                  minPerTeam: val,
                  mustHaveCount: val,
                }));
              }}
              placeholder="e.g. 1"
              value={draft.mustHaveCount}
            />
          </Field>
        ) : (
          <>
            <Field className="col-span-1">
              <FieldLabel htmlFor={`${idPrefix}-min`}>Min per Team</FieldLabel>
              <Input
                className="font-mono tabular-nums"
                id={`${idPrefix}-min`}
                inputMode="numeric"
                onChange={(event) =>
                  onChange((previous) => ({
                    ...previous,
                    minPerTeam: event.target.value,
                  }))
                }
                placeholder="0"
                value={draft.minPerTeam}
              />
            </Field>
            <Field className="col-span-1">
              <FieldLabel htmlFor={`${idPrefix}-max`}>Max per Team</FieldLabel>
              <Input
                className="font-mono tabular-nums"
                id={`${idPrefix}-max`}
                inputMode="numeric"
                onChange={(event) =>
                  onChange((previous) => ({
                    ...previous,
                    maxPerTeam: event.target.value,
                  }))
                }
                placeholder="1"
                value={draft.maxPerTeam}
              />
            </Field>
          </>
        )}
      </div>
    </div>
  );
}

export function TiersEditor({
  auctionId,
  assignments,
  teamCount = 0,
  tiers,
}: {
  auctionId: string;
  assignments: SerializedTierAssignment[];
  teamCount?: number;
  tiers: SerializedTier[];
}) {
  const [currentTiers, setCurrentTiers] = useState(tiers);
  const [currentAssignments, setCurrentAssignments] = useState(assignments);
  const [drafts, setDrafts] = useState<Record<string, TierDraft>>(() =>
    Object.fromEntries(tiers.map((tier) => [tier.id, toDraft(tier)])),
  );

  // Add Tier Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newTier, setNewTier] = useState<TierDraft>(EMPTY_TIER);
  const [addError, setAddError] = useState<null | string>(null);

  // Edit Tier Modal
  const [editingTier, setEditingTier] = useState<SerializedTier | null>(null);
  const [editingDraft, setEditingDraft] = useState<TierDraft>(EMPTY_TIER);
  const [editError, setEditError] = useState<null | string>(null);

  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<null | string>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  function applyTiers(next: SerializedTier[]) {
    setCurrentTiers(next);
    setDrafts(Object.fromEntries(next.map((tier) => [tier.id, toDraft(tier)])));
    setEditingTier(null);
  }

  async function run(
    action: () => Promise<
      | { message: string; status: "error" }
      | { status: "saved"; tiers: SerializedTier[] }
    >,
  ) {
    setPending(true);
    setMessage(null);
    setSaveState("saving");
    const result = await action();
    setPending(false);
    if (result.status === "saved") {
      applyTiers(result.tiers);
      setSaveState("saved");
    } else {
      setSaveState("error");
      setMessage(result.message);
    }
  }

  async function handleAddTier(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setAddError(null);
    setSaveState("saving");
    const result = await createTierAction(auctionId, newTier);
    setPending(false);
    if (result.status === "saved") {
      applyTiers(result.tiers);
      setNewTier(EMPTY_TIER);
      setIsAddOpen(false);
      setSaveState("saved");
    } else {
      setSaveState("error");
      setAddError(result.message);
    }
  }

  function openEditModal(tier: SerializedTier) {
    setEditingTier(tier);
    setEditingDraft(drafts[tier.id] ?? toDraft(tier));
    setEditError(null);
  }

  async function handleSaveTier(event: FormEvent) {
    event.preventDefault();
    if (!editingTier) return;
    setPending(true);
    setEditError(null);
    setSaveState("saving");
    const result = await updateTierAction(
      auctionId,
      editingTier.id,
      editingDraft,
    );
    setPending(false);
    if (result.status === "saved") {
      applyTiers(result.tiers);
      setEditingTier(null);
      setSaveState("saved");
    } else {
      setSaveState("error");
      setEditError(result.message);
    }
  }

  async function handleDeleteTier(tierId: string) {
    setPending(true);
    setSaveState("saving");
    const result = await deleteTierAction(auctionId, tierId);
    setPending(false);
    if (result.status === "saved") {
      applyTiers(result.tiers);
      if (editingTier?.id === tierId) {
        setEditingTier(null);
      }
      setSaveState("saved");
    } else {
      setSaveState("error");
      setMessage(result.message);
      if (editingTier?.id === tierId) {
        setEditError(result.message);
      }
    }
  }

  async function handleAssignSingle(
    playerEntryId: string,
    tierId: null | string,
  ): Promise<boolean> {
    setPending(true);
    const result = await assignPlayerTierAction(
      auctionId,
      playerEntryId,
      tierId,
    );
    setPending(false);
    if (result.status === "saved") {
      setCurrentAssignments((all) =>
        all.map((entry) =>
          entry.id === playerEntryId ? { ...entry, tierId } : entry,
        ),
      );
      setMessage(null);
      return true;
    } else {
      setMessage(result.message ?? "Could not assign Tier.");
      return false;
    }
  }

  async function handleAssignBulk(
    playerEntryIds: string[],
    tierId: null | string,
  ): Promise<boolean> {
    setPending(true);
    const result = await assignMultiplePlayerTiersAction(
      auctionId,
      playerEntryIds,
      tierId,
    );
    setPending(false);
    if (result.status === "saved") {
      const idSet = new Set(playerEntryIds);
      setCurrentAssignments((all) =>
        all.map((entry) =>
          idSet.has(entry.id) ? { ...entry, tierId } : entry,
        ),
      );
      setMessage(null);
      return true;
    } else {
      setMessage(result.message ?? "Could not assign Tiers.");
      return false;
    }
  }

  const assignedCount = currentAssignments.filter(
    (assignment) => assignment.tierId !== null,
  ).length;

  return (
    <div className="flex flex-col gap-5">
      <StationPlate
        label="Tiers"
        stat={
          <>
            <span className="text-muted-foreground/70">
              {currentTiers.length}{" "}
              {currentTiers.length === 1 ? "Tier" : "Tiers"}
            </span>
            <SaveReadout message={message} state={saveState} />
          </>
        }
      >
        <StationGroup hint="first Tier opens first" label="Ladder">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
            <span className="font-mono text-xs text-muted-foreground">
              {currentTiers.length}{" "}
              {currentTiers.length === 1 ? "tier" : "tiers"} configured
            </span>
            <Button
              onClick={() => {
                setNewTier(EMPTY_TIER);
                setAddError(null);
                setIsAddOpen(true);
              }}
              size="sm"
              type="button"
            >
              <Plus aria-hidden className="size-4" />
              Add Tier
            </Button>
          </div>

          {currentTiers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No Tiers yet. Add your first tier to set up the ladder.
              </p>
              <Button
                onClick={() => {
                  setNewTier(EMPTY_TIER);
                  setAddError(null);
                  setIsAddOpen(true);
                }}
                size="sm"
                type="button"
              >
                <Plus aria-hidden className="size-4" />
                Add Tier
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60">
              {currentTiers.map((tier, index) => {
                const isMustHave = isMustHaveTier(tier);
                const capacity =
                  isMustHave && teamCount > 0
                    ? teamCount * tier.minPerTeam
                    : null;
                const tierAssignedCount = currentAssignments.filter(
                  (a) => a.tierId === tier.id,
                ).length;

                return (
                  <li
                    className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0"
                    key={tier.id}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          aria-hidden
                          className="flex h-7 w-6 shrink-0 items-center font-mono text-xs font-semibold tabular-nums text-muted-foreground"
                        >
                          {index + 1}
                        </span>
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="truncate text-base font-semibold tracking-tight text-foreground">
                              {tier.label}
                            </span>
                            <span className="font-mono text-xs tabular-nums text-muted-foreground">
                              {tier.startingPrice.toLocaleString()} cr starting
                              price
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <Badge
                              className="text-[11px]"
                              variant={isMustHave ? "neon" : "outline"}
                            >
                              {isMustHave
                                ? `Must-Have: ${tier.minPerTeam} per Team`
                                : `Range: ${tier.minPerTeam}–${tier.maxPerTeam} per Team`}
                            </Badge>
                            {isMustHave && (
                              <>
                                {teamCount === 0 ? (
                                  <Badge variant="outline">
                                    Must-Have: Add Teams to determine capacity (
                                    {tier.minPerTeam} per Team)
                                  </Badge>
                                ) : tierAssignedCount === capacity ? (
                                  <Badge variant="success">
                                    Capacity reached: {tierAssignedCount}/
                                    {capacity} players ({tier.minPerTeam} per
                                    Team)
                                  </Badge>
                                ) : tierAssignedCount < (capacity ?? 0) ? (
                                  <Badge variant="secondary">
                                    Needs {(capacity ?? 0) - tierAssignedCount}{" "}
                                    more player
                                    {(capacity ?? 0) - tierAssignedCount === 1
                                      ? ""
                                      : "s"}{" "}
                                    ({tierAssignedCount}/{capacity} assigned)
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive">
                                    Over capacity: {tierAssignedCount}/
                                    {capacity} players
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pl-9 sm:pl-0">
                        <Button
                          aria-label={`Move up ${tier.label}`}
                          disabled={pending || index === 0}
                          onClick={() =>
                            run(() => moveTierAction(auctionId, tier.id, "up"))
                          }
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <ArrowUp aria-hidden className="size-4" />
                        </Button>
                        <Button
                          aria-label={`Move down ${tier.label}`}
                          disabled={
                            pending || index === currentTiers.length - 1
                          }
                          onClick={() =>
                            run(() =>
                              moveTierAction(auctionId, tier.id, "down"),
                            )
                          }
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <ArrowDown aria-hidden className="size-4" />
                        </Button>
                        <Button
                          disabled={pending}
                          onClick={() => openEditModal(tier)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          <Pencil aria-hidden className="size-3.5" />
                          Edit
                        </Button>
                        <Button
                          disabled={pending}
                          onClick={() => handleDeleteTier(tier.id)}
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </StationGroup>

        {message && <FieldError>{message}</FieldError>}
      </StationPlate>

      {/* Add Tier Modal */}
      <Dialog onOpenChange={setIsAddOpen} open={isAddOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Tier</DialogTitle>
            <DialogDescription>
              Create a new tier with starting price and team acquisition quotas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddTier}>
            <div className="flex flex-col gap-4 py-2">
              <TierFields
                draft={newTier}
                idPrefix="new-tier"
                nameLabel="Tier name"
                onChange={(update) => setNewTier(update)}
              />
              {addError && (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{addError}</AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter className="mt-4">
              <Button
                onClick={() => {
                  setIsAddOpen(false);
                  setAddError(null);
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={pending || newTier.label.trim().length === 0}
                type="submit"
              >
                {pending ? "Adding..." : "Add Tier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Tier Modal */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setEditingTier(null);
            setEditError(null);
          }
        }}
        open={editingTier !== null}
      >
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Tier</DialogTitle>
            <DialogDescription>
              Update settings and quotas for{" "}
              {editingTier?.label ? `"${editingTier.label}"` : "this tier"}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveTier}>
            <div className="flex flex-col gap-4 py-2">
              <TierFields
                draft={editingDraft}
                idPrefix={`edit-tier-${editingTier?.id ?? "curr"}`}
                nameLabel="Tier name"
                onChange={(update) => setEditingDraft(update)}
              />
              {editError && (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{editError}</AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter className="mt-4 sm:justify-between">
              <Button
                disabled={pending}
                onClick={async () => {
                  if (editingTier) {
                    await handleDeleteTier(editingTier.id);
                  }
                }}
                type="button"
                variant="destructive"
              >
                Remove Tier
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  onClick={() => {
                    setEditingTier(null);
                    setEditError(null);
                  }}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  disabled={pending || editingDraft.label.trim().length === 0}
                  type="submit"
                >
                  {pending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <StationPlate
        label="Tier assignments"
        stat={
          <>
            {assignedCount} of {currentAssignments.length} assigned
          </>
        }
        variant="section"
      >
        <TierAssignmentsTable
          assignments={currentAssignments}
          onAssignBulk={handleAssignBulk}
          onAssignSingle={handleAssignSingle}
          pending={pending}
          teamCount={teamCount}
          tiers={currentTiers}
        />
      </StationPlate>
    </div>
  );
}


