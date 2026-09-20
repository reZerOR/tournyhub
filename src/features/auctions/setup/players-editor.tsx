"use client";

import { type FormEvent, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  updateCustomPlayerFieldAction,
  updatePlayerEntryAction,
} from "@/features/auctions/setup/player-actions";
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
      <Field data-invalid={!values.displayName.trim()}>
        <FieldLabel htmlFor={`${idPrefix}-display-name`}>
          Display name
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
            onChange((previous) => ({ ...previous, role: event.target.value }))
          }
          value={values.role}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-external-player-id`}>
          External Player ID
        </FieldLabel>
        <Input
          id={`${idPrefix}-external-player-id`}
          maxLength={PLAYER_ENTRY_LIMITS.externalPlayerId}
          onChange={(event) =>
            onChange((previous) => ({
              ...previous,
              externalPlayerId: event.target.value,
            }))
          }
          value={values.externalPlayerId}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-phone-number`}>
          Phone number
        </FieldLabel>
        <Input
          id={`${idPrefix}-phone-number`}
          maxLength={PLAYER_ENTRY_LIMITS.phoneNumber}
          onChange={(event) =>
            onChange((previous) => ({
              ...previous,
              phoneNumber: event.target.value,
            }))
          }
          value={values.phoneNumber}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-starting-price`}>
          Starting price
        </FieldLabel>
        <Input
          id={`${idPrefix}-starting-price`}
          inputMode="numeric"
          maxLength={String(PLAYER_ENTRY_LIMITS.startingPriceMax).length}
          onChange={(event) =>
            onChange((previous) => ({
              ...previous,
              startingPriceOverride: event.target.value,
            }))
          }
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
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [hasSaved, setHasSaved] = useState(false);

  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [editingFieldId, setEditingFieldId] = useState<null | string>(null);
  const [editingFieldLabel, setEditingFieldLabel] = useState("");

  const [newPlayer, setNewPlayer] = useState<PlayerFormValues>(EMPTY_PLAYER);
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
    setHasSaved(true);
  }

  function reportError(message: string) {
    setHasSaved(false);
    setErrorMessage(message);
  }

  async function addCustomField(event: FormEvent) {
    event.preventDefault();
    setPending(true);
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

  async function addPlayer(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await createPlayerEntryAction(auctionId, toInput(newPlayer));
    setPending(false);
    if (result.status === "saved") {
      setEntries((previous) => [...previous, result.entry]);
      setNewPlayer(EMPTY_PLAYER);
      reportSaved();
    } else {
      reportError(result.message);
    }
  }

  async function savePlayer(event: FormEvent) {
    event.preventDefault();
    if (!editingEntry || !editingEntryId) return;
    setPending(true);
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
      setEditingEntryId(null);
      setEditingEntry(null);
      setEditingEntryError(null);
      reportSaved();
    } else {
      setEditingEntryError(result.message);
    }
  }

  async function removePlayer(playerEntryId: string) {
    setPending(true);
    const result = await deletePlayerEntryAction(auctionId, playerEntryId);
    setPending(false);
    if (result.status === "saved") {
      setEntries((previous) =>
        previous.filter((entry) => entry.id !== playerEntryId),
      );
      if (editingEntryId === playerEntryId) {
        setEditingEntryId(null);
        setEditingEntry(null);
      }
      reportSaved();
    } else {
      reportError(result.message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Players
          </CardTitle>
          <CardDescription>
            Add Player Entries with a display name. Every other detail is
            optional and stays with this Auction.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Custom Player Fields</h3>
            {customFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Custom Player Fields yet. Add one to capture game-specific
                details.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {customFields.map((field) =>
                  editingFieldId === field.id ? (
                    <li key={field.id}>
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(event) => renameCustomField(event, field.id)}
                      >
                        <Input
                          aria-label={`Label for ${field.label}`}
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
                      className="flex items-center justify-between gap-2"
                      key={field.id}
                    >
                      <span>{field.label}</span>
                      <div className="flex gap-1">
                        <Button
                          onClick={() => {
                            setEditingFieldId(field.id);
                            setEditingFieldLabel(field.label);
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Rename field
                        </Button>
                        <Button
                          onClick={() => removeCustomField(field.id)}
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          Remove field
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
                Add field
              </Button>
            </form>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Add a Player Entry</h3>
            <form onSubmit={addPlayer}>
              <PlayerFields
                customFields={customFields}
                idPrefix="new-player"
                onChange={setNewPlayer}
                values={newPlayer}
              />
              <div className="mt-4">
                <Button disabled={pending} type="submit">
                  Add Player
                </Button>
              </div>
            </form>
          </section>

          <p
            aria-live="polite"
            className="text-sm text-muted-foreground"
            role="status"
          >
            {pending
              ? "Saving…"
              : errorMessage
                ? `Failed to save: ${errorMessage}`
                : hasSaved
                  ? "Saved"
                  : ""}
          </p>
        </CardContent>
      </Card>

      {editingEntry && editingEntryId && (
        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Edit Player Entry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={savePlayer}>
              <PlayerFields
                customFields={customFields}
                idPrefix="edit-player"
                onChange={(update) =>
                  setEditingEntry((previous) =>
                    previous ? update(previous) : previous,
                  )
                }
                values={editingEntry}
              />
              {editingEntryError && (
                <FieldError>{editingEntryError}</FieldError>
              )}
              <div className="mt-4 flex gap-2">
                <Button disabled={pending} type="submit">
                  Save Player
                </Button>
                <Button
                  onClick={() => {
                    setEditingEntryId(null);
                    setEditingEntry(null);
                    setEditingEntryError(null);
                  }}
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Player Entries
          </CardTitle>
          <CardDescription>
            {entries.length} of{" "}
            {PLAYER_ENTRY_LIMITS.maxEntriesPerAuction.toLocaleString()} Player
            Entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {duplicateNames.size > 0 && (
            <Alert>
              <AlertTitle>Duplicate display names</AlertTitle>
              <AlertDescription>
                These names appear more than once. They are saved, but check
                that they are different Players: {duplicateLabels}.
              </AlertDescription>
            </Alert>
          )}
          <table className="w-full text-sm">
            <caption className="sr-only">Player Entries</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium" scope="col">
                  Name
                </th>
                <th className="py-2 pr-3 font-medium" scope="col">
                  Role
                </th>
                <th className="py-2 pr-3 font-medium" scope="col">
                  External Player ID
                </th>
                <th className="py-2 pr-3 font-medium" scope="col">
                  Starting price
                </th>
                <th className="py-2 pr-3 font-medium" scope="col">
                  Custom values
                </th>
                <th className="py-2 font-medium" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td className="py-3 text-muted-foreground" colSpan={6}>
                    You haven&apos;t added any Player Entries yet.
                  </td>
                </tr>
              )}
              {entries.map((entry) => (
                <tr className="border-b align-top last:border-0" key={entry.id}>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span>{entry.displayName}</span>
                      {duplicateNames.has(
                        normalizeDisplayName(entry.displayName),
                      ) && <Badge variant="outline">Duplicate name</Badge>}
                    </div>
                  </td>
                  <td className="py-2 pr-3">{entry.role ?? "—"}</td>
                  <td className="py-2 pr-3">{entry.externalPlayerId ?? "—"}</td>
                  <td className="py-2 pr-3">
                    {entry.startingPriceOverride ?? "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {customFields.length === 0 ? (
                      "—"
                    ) : (
                      <ul className="flex flex-col gap-0.5">
                        {customFields.map((field) => (
                          <li className="text-muted-foreground" key={field.id}>
                            {field.label}: {entry.customValues[field.id] ?? "—"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <Button
                        onClick={() => {
                          setEditingEntryId(entry.id);
                          setEditingEntry(toFormValues(entry));
                          setEditingEntryError(null);
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() => removePlayer(entry.id)}
                        size="sm"
                        type="button"
                        variant="destructive"
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
