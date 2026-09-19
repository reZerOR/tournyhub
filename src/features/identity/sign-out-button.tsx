"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/features/identity/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Button disabled={isSigningOut} onClick={handleSignOut} variant="outline">
      {isSigningOut ? "Signing out…" : "Sign out"}
    </Button>
  );
}
