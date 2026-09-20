import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { SignOutButton } from "@/features/identity/sign-out-button";
import { getCurrentSession } from "@/server/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/app" className="font-heading text-lg font-semibold">
          TournyHub
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {session.user.name || session.user.email}
          </span>
          <Link
            href="/app/account"
            className={buttonVariants({ size: "sm", variant: "ghost" })}
          >
            Account
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
