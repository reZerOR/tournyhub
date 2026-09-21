import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/*
  AuthShell — the full-bleed arena chrome for /sign-in. Permanent dark
  mode: public/background.png stays as the floor under a dark legibility
  scrim, so the white-text lockup reads without any theme switching.
*/
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="auth-shell"
      className="dark relative isolate min-h-svh overflow-hidden bg-black"
    >
      <Image
        src="/background.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/75"
      />

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-4 sm:px-10">
        <Link
          href="/"
          aria-label="TournyHub home"
          className="flex items-center"
        >
          <Image
            src="/logo-text-dark-mode.png"
            alt="TournyHub"
            width={2172}
            height={724}
            priority
            className="h-14 w-auto"
          />
        </Link>
        <p className="hidden text-sm text-white/70 sm:block">
          Tournaments run better here.
        </p>
      </header>

      <main className="relative z-10 flex min-h-svh w-full items-center justify-center px-6 py-28">
        {children}
      </main>

      <footer className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center justify-between gap-2 px-6 py-4 text-xs text-white/60 sm:flex-row sm:px-10">
        <p>© {new Date().getFullYear()} TournyHub. All rights reserved.</p>
        <p className="flex items-center gap-4">
          <span>Terms</span>
          <span>Privacy</span>
          <span>Support</span>
        </p>
      </footer>
    </div>
  );
}
