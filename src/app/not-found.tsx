import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/**
 * The not-found boundary. It gives the User a clear next action instead of a
 * bare status code, and it is deliberately identical for a missing record and
 * for one the User may not see.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        This page is not available
      </h1>
      <p className="text-muted-foreground">
        The page may have moved, or it may belong to someone else. Nothing you
        can do here will reveal which.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link className={buttonVariants()} href="/app">
          Go to the dashboard
        </Link>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href="/sign-in"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
