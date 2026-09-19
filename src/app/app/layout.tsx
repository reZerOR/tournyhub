import { redirect } from "next/navigation";
import type { ReactNode } from "react";

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
        <span className="font-heading text-lg font-semibold">TournyHub</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {session.user.email}
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
