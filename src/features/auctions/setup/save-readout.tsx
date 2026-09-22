"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { cn } from "cn";

export type SaveState = "error" | "idle" | "saved" | "saving";

/**
 * The station's save readout: the monospace light that says whether what the
 * Organizer just typed is committed. It is the station's only live region, so
 * anything else that wants to announce itself has to say it in words here
 * rather than opening a second one.
 *
 * A committed save is also the moment the shared shell goes out of date: the
 * readiness lamps and the launch gate were computed when the station opened.
 * Re-reading the route here keeps the count beside the lever true while the
 * Organizer is still standing on this station.
 */
export function SaveReadout({
  className,
  message,
  state,
}: {
  className?: string;
  message?: null | string;
  state: SaveState;
}) {
  const router = useRouter();

  useEffect(() => {
    if (state !== "saved") return;
    router.refresh();
  }, [router, state]);

  return (
    <p
      aria-live="polite"
      className={cn(
        "font-mono text-xs tabular-nums",
        state === "saved" && "text-roster",
        state === "saving" && "text-muted-foreground",
        state === "error" && "text-destructive",
        className,
      )}
      role="status"
    >
      {state === "saving" && "Saving…"}
      {state === "saved" && "Saved"}
      {state === "error" && `Failed to save${message ? `: ${message}` : ""}`}
    </p>
  );
}
