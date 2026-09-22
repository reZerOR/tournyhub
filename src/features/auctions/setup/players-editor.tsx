"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash } from "lucide-react";

import { StationGroup, StationPlate } from "@/components/arena";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  findDuplicateDisplayNames,
  normalizeDisplayName,
  PLAYER_ENTRY_LIMITS,
  type PlayerEntryInput,
} from "@/domain/player-entry";
import {
  createCustomPlayerFieldAction,
  createPlayerEntryAction,
  deleteCustomPlayerFieldAction,
  deletePlayerEntryAction,
  loadPlayerSetupAction,
  updateCustomPlayerFieldAction,
  updatePlayerEntryAction,
} from "@/features/auctions/setup/player-actions";
import { PlayerImport } from "@/features/auctions/setup/player-import";
import { PlayerTable } from "@/features/auctions/setup/player-table";
import {
  SaveReadout,
  type SaveState,
} from "@/features/auctions/setup/save-readout";
import type {
  SerializedCustomPlayerField,
  SerializedPlayerEntry,
} from "@/features/auctions/setup/serialize-player";

interface PlayerFormValues {
  customValues: Record<string, string>;
  displayName: string;
  externalPlayerId: string;
  phoneNumber: string;
  role: string;
  startingPriceOverride: string;
}

const EMPTY_PLAYER: PlayerFormValues = {
  customValues: {},
  displayName: "",
  externalPlayerId: "",
  phoneNumber: "",
  role: "",
  startingPriceOverride: "",
};

function toFormValues(entry: SerializedPlayerEntry): PlayerFormValues {
  return {
    customValues: { ...entry.customValues },
    displayName: entry.displayName,
    externalPlayerId: entry.externalPlayerId ?? "",
    phoneNumber: entry.phoneNumber ?? "",
    role: entry.role ?? "",
    startingPriceOverride:
      entry.startingPriceOverride === null
        ? ""
        : String(entry.startingPriceOverride),
  };
}

function toInput(values: PlayerFormValues): PlayerEntryInput {
  return {
    customValues: values.customValues,
    displayName: values.displayName,
    externalPlayerId: values.externalPlayerId,
    phoneNumber: values.phoneNumber,
    role: values.role,
    startingPriceOverride:
      values.startingPriceOverride.trim() === ""
        ? null
        : values.startingPriceOverride,
  };
}

function withoutCustomValue(
  values: PlayerFormValues,
  customPlayerFieldId: string,
): PlayerFormValues {
  if (!(customPlayerFieldId in values.customValues)) return values;
  const customValues = { ...values.customValues };
  delete customValues[customPlayerFieldId];
  return { ...values, customValues };
}

function PlayerFields({
  customFields,
  idPrefix,
  onChange,
  values,
}: {
  customFields: SerializedCustomPlayerField[];
  idPrefix: string;
  onChange: (update: (previous: PlayerFormValues) => PlayerFormValues) => void;
  values: PlayerFormValues;
}) {
  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!values.displayName.trim()}>
          <FieldLabel htmlFor={`${idPrefix}-display-name`}>
            Display name *
          </FieldLabel>
          <Input
            aria-invalid={!values.displayName.trim()}
            id={`${idPrefix}-display-name`}
            maxLength={PLAYER_ENTRY_LIMITS.displayName}
            onChange={(event) =>
              onChange((previous) => ({
                ...previous,
                displayName: event.target.value,
              }))
            }
            placeholder="e.g. John Doe"
            value={values.displayName}
          />
          {!values.displayName.trim() && (
            <FieldError>Display name is required.</FieldError>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-role`}>Role</FieldLabel>
          <Input
            id={`${idPrefix}-role`}
            maxLength={PLAYER_ENTRY_LIMITS.role}
            onChange={(event) =>
              onChange((previous) => ({
                ...previous,
                role: event.target.value,
              }))
            }
            placeholder="e.g. Forward, Midlaner"
            value={values.role}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-external-player-id`}>
            External Player ID
          </FieldLabel>
          <Input
            className="font-mono"
            id={`${idPrefix}-external-player-id`}
            maxLength={PLAYER_ENTRY_LIMITS.externalPlayerId}
            onChange={(event) =>
              onChange((previous) => ({
                ...previous,
                externalPlayerId: event.target.value,
              }))
            }
            placeholder="e.g. PLY-101"
            value={values.externalPlayerId}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-phone-number`}>
            Phone number
          </FieldLabel>
          <Input
            className="font-mono"
            id={`${idPrefix}-phone-number`}
            maxLength={PLAYER_ENTRY_LIMITS.phoneNumber}
            onChange={(event) =>
              onChange((previous) => ({
                ...previous,
                phoneNumber: event.target.value,
              }))
            }
            placeholder="e.g. +1 555-0100"
            value={values.phoneNumber}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-starting-price`}>
            Starting price
          </FieldLabel>
          <Input
            className="font-mono tabular-nums"
            id={`${idPrefix}-starting-price`}
            inputMode="numeric"
            maxLength={String(PLAYER_ENTRY_LIMITS.startingPriceMax).length}
            onChange={(event) =>
              onChange((previous) => ({
                ...previous,
                startingPriceOverride: event.target.value,
              }))
            }
            placeholder="e.g. 100"
            value={values.startingPriceOverride}
          />
        </Field>
        {customFields.map((field) => (
          <Field key={field.id}>
            <FieldLabel htmlFor={`${idPrefix}-custom-${field.id}`}>
              {field.label}
            </FieldLabel>
            <Input
              id={`${idPrefix}-custom-${field.id}`}
              maxLength={PLAYER_ENTRY_LIMITS.customFieldValue}
              onChange={(event) =>
                onChange((previous) => ({
                  ...previous,
                  customValues: {
                    ...previous.customValues,
                    [field.id]: event.target.value,
                  },
                }))
              }
              value={values.customValues[field.id] ?? ""}
            />
          </Field>
        ))}
      </div>
    </FieldGroup>
  );
}

export function PlayersEditor({
  auctionId,
  customFields: initialCustomFields,
  entries: initialEntries,
}: {
  auctionId: string;
  customFields: SerializedCustomPlayerField[];
  entries: SerializedPlayerEntry[];
}) {
  const [customFields, setCustomFields] = useState(initialCustomFields);
  const [entries, setEntries] = useState(initialEntries);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Custom field management
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [editingFieldId, setEditingFieldId] = useState<null | string>(null);
  const [editingFieldLabel, setEditingFieldLabel] = useState("");

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newPlayer, setNewPlayer] = useState<PlayerFormValues>(EMPTY_PLAYER);
  const [addPlayerError, setAddPlayerError] = useState<null | string>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<null | string>(null);
  const [editingEntry, setEditingEntry] = useState<null | PlayerFormValues>(
    null,
  );
  const [editingEntryError, setEditingEntryError] = useState<null | string>(
    null,
  );

  const duplicateNames = useMemo(
    () => findDuplicateDisplayNames(entries),
    [entries],
  );
  const duplicateLabels = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const entry of entries) {
      const key = normalizeDisplayName(entry.displayName);
      if (duplicateNames.has(key) && !seen.has(key)) {
        seen.add(key);
        labels.push(entry.displayName);
      }
    }
    return labels.join(", ");
  }, [duplicateNames, entries]);

  function reportSaved() {
    setErrorMessage(null);
    setSaveState("saved");
  }

  function reportError(message: string) {
    setSaveState("error");
    setErrorMessage(message);
  }

  async function addCustomField(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setSaveState("saving");
    const result = await createCustomPlayerFieldAction(auctionId, {
      label: newFieldLabel,
    });
    setPending(false);
    if (result.status === "saved") {
      setCustomFields((previous) => [...previous, result.field]);
      setNewFieldLabel("");
      reportSaved();
    } else {
      reportError(result.message);
    }
  }

  async function renameCustomField(
    event: FormEvent,
    customPlayerFieldId: string,
  ) {
    event.preventDefault();
    setPending(true);
    setSaveState("saving");
    const result = await updateCustomPlayerFieldAction(
      auctionId,
      customPlayerFieldId,
      { label: editingFieldLabel },
    );
    setPending(false);
    if (result.status === "saved") {
      setCustomFields((previous) =>
        previous.map((field) =>
          field.id === customPlayerFieldId ? result.field : field,
        ),
      );
      setEditingFieldId(null);
      reportSaved();
    } else {
      reportError(result.message);
    }
  }

  async function removeCustomField(customPlayerFieldId: string) {
    setPending(true);
    setSaveState("saving");
    const result = await deleteCustomPlayerFieldAction(
      auctionId,
      customPlayerFieldId,
    );
    setPending(false);
    if (result.status === "saved") {
      setCustomFields((previous) =>
        previous.filter((field) => field.id !== customPlayerFieldId),
      );
      setEntries((previous) =>
        previous.map((entry) => {
          const customValues = { ...entry.customValues };
          delete customValues[customPlayerFieldId];
          return { ...entry, customValues };
        }),
      );
      setNewPlayer((previous) =>
        withoutCustomValue(previous, customPlayerFieldId),
      );
      setEditingEntry((previous) =>
        previous ? withoutCustomValue(previous, customPlayerFieldId) : previous,
      );
      reportSaved();
    } else {
      reportError(result.message);
    }
  }

  async function handleAddPlayer(event: FormEvent) {
    event.preventDefault();
    if (!newPlayer.displayName.trim()) {
      setAddPlayerError("Display name is required.");
      return;
    }
    setPending(true);
    setSaveState("saving");
    setAddPlayerError(null);
    const result = await createPlayerEntryAction(auctionId, toInput(newPlayer));
    setPending(false);
    if (result.status === "saved") {
      setEntries((previous) => [...previous, result.entry]);
      setNewPlayer(EMPTY_PLAYER);
      setIsAddModalOpen(false);
      reportSaved();
    } else {
      setAddPlayerError(result.message);
      reportError(result.message);
    }
  }

  function openEditModal(entry: SerializedPlayerEntry) {
    setEditingEntryId(entry.id);
    setEditingEntry(toFormValues(entry));
    setEditingEntryError(null);
    setIsEditModalOpen(true);
  }

  async function handleSavePlayer(event: FormEvent) {
    event.preventDefault();
    if (!editingEntry || !editingEntryId) return;
    if (!editingEntry.displayName.trim()) {
      setEditingEntryError("Display name is required.");
      return;
    }
    setPending(true);
    setSaveState("saving");
    setEditingEntryError(null);
    const result = await updatePlayerEntryAction(
      auctionId,
      editingEntryId,
      toInput(editingEntry),
    );
    setPending(false);
    if (result.status === "saved") {
      setEntries((previous) =>
        previous.map((entry) =>
          entry.id === editingEntryId ? result.entry : entry,
        ),
      );
      setIsEditModalOpen(false);
      setEditingEntryId(null);
      setEditingEntry(null);
      reportSaved();
    } else {
      setSaveState("error");
      setEditingEntryError(result.message);
    }
  }

  async function removePlayer(playerEntryId: string) {
    setPending(true);
    setSaveState("saving");
    const result = await deletePlayerEntryAction(auctionId, playerEntryId);
    setPending(false);
    if (result.status === "saved") {
      setEntries((previous) =>
        previous.filter((entry) => entry.id !== playerEntryId),
      );
      if (editingEntryId === playerEntryId) {
        setIsEditModalOpen(false);
        setEditingEntryId(null);
        setEditingEntry(null);
      }
      reportSaved();
    } else {
      reportError(result.message);
    }
  }

  async function reloadSetup() {
    const snapshot = await loadPlayerSetupAction(auctionId);
    if (!snapshot) return;
    setCustomFields(snapshot.customFields);
    setEntries(snapshot.entries);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <StationPlate
        label="Players"
        stat={
          <>
            <span className="text-muted-foreground/70">
              {entries.length} of{" "}
              {PLAYER_ENTRY_LIMITS.maxEntriesPerAuction.toLocaleString()}
            </span>
            <SaveReadout message={errorMessage} state={saveState} />
          </>
        }
      >
        <StationGroup
          hint={
            duplicateNames.size > 0
              ? `${duplicateNames.size} duplicate ${
                  duplicateNames.size === 1 ? "name" : "names"
                }`
              : "no duplicate names"
          }
          label="Roster"
        >
          {duplicateNames.size > 0 && (
            <Alert variant="warning">
              <AlertTitle>Duplicate display names</AlertTitle>
              <AlertDescription>
                These names appear more than once. They are saved, but check
                that they are different Players: {duplicateLabels}.
              </AlertDescription>
            </Alert>
          )}

          <PlayerTable
            customFields={customFields}
            duplicateNames={duplicateNames}
            entries={entries}
            onAddClick={() => {
              setNewPlayer(EMPTY_PLAYER);
              setAddPlayerError(null);
              setIsAddModalOpen(true);
            }}
            onEditClick={openEditModal}
            onRemoveClick={removePlayer}
            pending={pending}
          />
        </StationGroup>

        <StationGroup
          hint={`max ${PLAYER_ENTRY_LIMITS.maxCustomFieldsPerAuction}`}
          label="Custom Player Fields"
        >
          {customFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Custom Player Fields yet. Add one to capture game-specific
              details.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60">
              {customFields.map((field) =>
                editingFieldId === field.id ? (
                  <li className="py-2 first:pt-0" key={field.id}>
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(event) => renameCustomField(event, field.id)}
                    >
                      <Input
                        aria-label={`Label for ${field.label}`}
                        className="max-w-xs"
                        maxLength={PLAYER_ENTRY_LIMITS.customFieldLabel}
                        onChange={(event) =>
                          setEditingFieldLabel(event.target.value)
                        }
                        value={editingFieldLabel}
                      />
                      <Button disabled={pending} size="sm" type="submit">
                        Save field
                      </Button>
                      <Button
                        onClick={() => setEditingFieldId(null)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                    </form>
                  </li>
                ) : (
                  <li
                    className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                    key={field.id}
                  >
                    <span className="text-sm">{field.label}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        aria-label={`Rename ${field.label} field`}
                        onClick={() => {
                          setEditingFieldId(field.id);
                          setEditingFieldLabel(field.label);
                        }}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Pencil aria-hidden className="size-4" />
                      </Button>
                      <Button
                        aria-label={`Remove ${field.label} field`}
                        onClick={() => removeCustomField(field.id)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash aria-hidden className="size-4" />
                      </Button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}

          <form className="flex items-end gap-2" onSubmit={addCustomField}>
            <Field className="max-w-xs">
              <FieldLabel htmlFor="new-custom-field">Field label</FieldLabel>
              <Input
                id="new-custom-field"
                maxLength={PLAYER_ENTRY_LIMITS.customFieldLabel}
                onChange={(event) => setNewFieldLabel(event.target.value)}
                value={newFieldLabel}
              />
            </Field>
            <Button disabled={pending} size="sm" type="submit">
              <Plus aria-hidden className="size-4" />
              Add field
            </Button>
          </form>
        </StationGroup>
      </StationPlate>

      {/* Add Player Modal */}
      <Dialog onOpenChange={setIsAddModalOpen} open={isAddModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Player Entry</DialogTitle>
            <DialogDescription>
              Enter the details for a new player in this auction roster.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddPlayer}>
            <PlayerFields
              customFields={customFields}
              idPrefix="new-player-modal"
              onChange={setNewPlayer}
              values={newPlayer}
            />
            {addPlayerError && (
              <Alert className="mt-4" variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{addPlayerError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter className="mt-6">
              <Button
                onClick={() => setIsAddModalOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={pending} type="submit">
                {pending ? "Adding..." : "Add Player"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Player Modal */}
      <Dialog
        onOpenChange={(open) => {
          setIsEditModalOpen(open);
          if (!open) {
            setEditingEntryId(null);
            setEditingEntry(null);
            setEditingEntryError(null);
          }
        }}
        open={isEditModalOpen}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Player Entry</DialogTitle>
            <DialogDescription>
              Update details for{" "}
              {editingEntry?.displayName || "this player entry"}.
            </DialogDescription>
          </DialogHeader>
          {editingEntry && (
            <form onSubmit={handleSavePlayer}>
              <PlayerFields
                customFields={customFields}
                idPrefix="edit-player-modal"
                onChange={(update) =>
                  setEditingEntry((previous) =>
                    previous ? update(previous) : previous,
                  )
                }
                values={editingEntry}
              />
              {editingEntryError && (
                <Alert className="mt-4" variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{editingEntryError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter className="mt-6">
                <Button
                  onClick={() => setIsEditModalOpen(false)}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button disabled={pending} type="submit">
                  {pending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <PlayerImport auctionId={auctionId} onImported={reloadSetup} />
    </div>
  );
}
