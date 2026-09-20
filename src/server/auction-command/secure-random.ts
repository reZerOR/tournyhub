import { randomBytes } from "node:crypto";

/**
 * A cryptographically secure fraction in [0, 1). Random Selection and
 * constrained random matching both draw the choice they present as fair from
 * here, so a participant cannot predict or influence it. Commands accept a
 * `random` override so tests can be deterministic without weakening the
 * production path.
 */
export function secureFraction(): number {
  const bytes = randomBytes(6);
  let value = 0;
  for (const byte of bytes) {
    value = value * 256 + byte;
  }
  // 48 bits of entropy, plenty to choose uniformly among at most 2,000 Players
  // or 32 Teams.
  return value / 2 ** 48;
}
