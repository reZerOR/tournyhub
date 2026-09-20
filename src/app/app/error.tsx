"use client";

import Link from "next/link";
import { useEffect } from "react";

import { buttonVariants } from "@/components/ui/button";

/**
 * The authenticated error boundary. It offers a Retry that re-renders the
 * failed route and a way back to the dashboard, and it shows no internal
 * detail, so a service or database failure cannot leak through it.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The failure is already recorded in the platform logs with a stable
    // correlation id. Nothing sensitive belongs on screen or in the console.
    console.error("Authenticated route failed", error.digest ?? "no-digest");
  }, [error.digest]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p aria-live="polite" className="text-muted-foreground" role="status">
        The page could not be shown
        {error.digest ? ` (reference ${error.digest})` : ""}. Try again, or
        return to the dashboard.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button className={buttonVariants()} onClick={reset} type="button">
          Try again
        </button>
        <Link className={buttonVariants({ variant: "outline" })} href="/app">
          Go to the dashboard
        </Link>
      </div>
    </div>
  );
}
