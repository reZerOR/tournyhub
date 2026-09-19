import { redirect } from "next/navigation";

import { SignInForm } from "@/features/identity/sign-in-form";
import { getCurrentSession } from "@/server/auth/session";

export default async function SignInPage() {
  const session = await getCurrentSession();

  if (session) {
    redirect("/app");
  }

  return (
    <main className="flex min-h-svh w-full items-center justify-center px-6 py-16">
      <SignInForm />
    </main>
  );
}
