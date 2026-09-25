import type { LiveSnapshot } from "@/domain/live";

/** Ignore an HTTP response that arrived after a newer command or pull. */
export function acceptLiveSnapshot(
  previous: LiveSnapshot,
  next: LiveSnapshot,
  commit: (next: LiveSnapshot) => void,
): void {
  if (next.revision < previous.revision) return;
  commit(next);
}
