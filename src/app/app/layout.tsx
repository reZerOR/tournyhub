import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { FeedbackForm } from "@/features/feedback/feedback-form";
import { SignOutButton } from "@/features/identity/sign-out-button";
import {
  AppNavigation,
  MobileAppNavigation,
} from "@/features/navigation/app-navigation";
import { isPlatformAdministrator } from "@/server/auction-query/administration";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 0) {
    return parts
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

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
  const userLabel = session.user.name || session.user.email;

  return (
    <div className="app-shell min-h-svh bg-background lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        href="#main"
      >
        Skip to main content
      </a>
      <aside className="app-shell-sidebar sticky top-0 hidden h-svh border-r border-sidebar-border text-sidebar-foreground lg:block">
        <Suspense fallback={null}>
          <AppNavigation administrator={administrator} />
        </Suspense>
      </aside>

      <div className="flex min-h-svh min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <div className="lg:hidden">
              <Suspense
                fallback={
                  <Button
                    aria-label="Open navigation"
                    disabled
                    size="icon"
                    variant="ghost"
                  />
                }
              >
                <MobileAppNavigation administrator={administrator} />
              </Suspense>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                Auction workspace
              </p>
              <p className="hidden text-xs text-muted-foreground sm:block">
                One Live Auction at a time
              </p>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <Link
              aria-label="Open account settings"
              className={buttonVariants({
                className: "h-10 max-w-52 justify-start gap-2 px-2",
                variant: "ghost",
              })}
              href="/app/account"
            >
              <Avatar size="sm">
                <AvatarFallback>
                  {initials(session.user.name, session.user.email)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden min-w-0 flex-col items-start sm:flex">
                <span className="max-w-36 truncate text-sm font-medium">
                  {userLabel}
                </span>
                <span className="max-w-36 truncate text-xs font-normal text-muted-foreground">
                  {session.user.email}
                </span>
              </span>
            </Link>
            <SignOutButton />
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-7 xl:px-8" id="main">
          <div className="mx-auto w-full max-w-[90rem]">{children}</div>
        </main>

        {/*
          Feedback is reachable from every main page without leaving it. The form
          reports the page it is opened on and never reads Auction state.
        */}
        <footer className="border-t border-border bg-background/70 px-4 py-4 backdrop-blur-xl sm:px-6">
          <details className="mx-auto w-full max-w-[90rem]">
            <summary className="w-fit cursor-pointer text-sm font-medium">
              Beta feedback
            </summary>
            <div className="mt-4 max-w-xl">
              <FeedbackForm />
            </div>
          </details>
        </footer>
      </div>
    </div>
  );
}
