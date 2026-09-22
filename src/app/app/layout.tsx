import { redirect } from "next/navigation";
import Link from "next/link";
import { type ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/features/navigation/app-navigation";
import { SignOutButton } from "@/features/identity/sign-out-button";
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
  const showEmail = userLabel !== session.user.email;

  return (
    <SidebarProvider defaultOpen={true}>
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        href="#main"
      >
        Skip to main content
      </a>

      <AppSidebar administrator={administrator} user={session.user} />

      <SidebarInset className="app-shell flex min-h-svh min-w-0 flex-col bg-background">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger aria-label="Toggle sidebar" />
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
                {showEmail && (
                  <span className="max-w-36 truncate text-xs font-normal text-muted-foreground">
                    {session.user.email}
                  </span>
                )}
              </span>
            </Link>
            <SignOutButton />
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-7 xl:px-8" id="main">
          <div className="mx-auto w-full max-w-[90rem]">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
