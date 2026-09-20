export const TEAM_LOGO_LIMITS = {
  maxBytes: 1_000_000,
  maxDimension: 2048,
} as const;

/** A Team logo rule the Organizer can repair, as opposed to an unexpected failure. */
export class TeamLogoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamLogoError";
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export const PNG_SIGNATURE_BYTES = Uint8Array.from(PNG_SIGNATURE);
