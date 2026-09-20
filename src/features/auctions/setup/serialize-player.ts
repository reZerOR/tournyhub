import type { CustomPlayerField, PlayerEntry } from "@/domain/player-entry";

export interface SerializedCustomPlayerField {
  id: string;
  label: string;
}

export interface SerializedPlayerEntry {
  customValues: Record<string, string>;
  displayName: string;
  externalPlayerId: null | string;
  id: string;
  phoneNumber: null | string;
  role: null | string;
  startingPriceOverride: null | number;
}

export function serializeCustomPlayerField(
  field: CustomPlayerField,
): SerializedCustomPlayerField {
  return { id: field.id, label: field.label };
}

export function serializePlayerEntry(
  entry: PlayerEntry,
): SerializedPlayerEntry {
  return {
    customValues: entry.customValues,
    displayName: entry.displayName,
    externalPlayerId: entry.externalPlayerId,
    id: entry.id,
    phoneNumber: entry.phoneNumber,
    role: entry.role,
    startingPriceOverride: entry.startingPriceOverride,
  };
}
