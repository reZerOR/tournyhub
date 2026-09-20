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
  isRepresentative: boolean;
  phoneNumber: null | string;
  role: null | string;
  startingPriceOverride: null | number;
  teamId: null | string;
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
    isRepresentative: entry.isRepresentative,
    phoneNumber: entry.phoneNumber,
    role: entry.role,
    startingPriceOverride: entry.startingPriceOverride,
    teamId: entry.teamId,
  };
}
