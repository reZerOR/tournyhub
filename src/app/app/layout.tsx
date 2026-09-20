import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { FeedbackForm } from "@/features/feedback/feedback-form";
import { SignOutButton } from "@/features/identity/sign-out-button";
import { isPlatformAdministrator } from "@/server/auction-query/administration";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/sign-in");
  }

  // Platform Administration is an allowlisted role, so its entry point appears
  // only for an administrator. It grants no Auction-control authority.
  const administrator = await isPlatformAdministrator(
    getPool(),
    session.user.id,
  );

  return (
    <div className="flex min-h-svh flex-col">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        href="#main"
      >
        Skip to main content
      </a>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-4 sm:px-6">
        <Link href="/app" className="font-heading text-lg font-semibold">
          TournyHub
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {session.user.name || session.user.email}
          </span>
          {administrator && (
            <Link
              href="/app/admin"
              className={buttonVariants({ size: "sm", variant: "ghost" })}
            >
              Admin
            </Link>
          )}
          <Link
            href="/app/account"
            className={buttonVariants({ size: "sm", variant: "ghost" })}
          >
            Account
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10" id="main">
        {children}
      </main>
      {/*
        Feedback is reachable from every main page without leaving it. The form
        reports the page it is opened on and never reads Auction state.
      */}
      <footer className="border-t px-4 py-4 sm:px-6">
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Beta feedback
          </summary>
          <div className="mt-3 max-w-xl">
            <FeedbackForm />
          </div>
        </details>
      </footer>
    </div>
  );
}
