import { redirect } from "next/navigation";

import { serverEnv } from "@/config/server-env";
import { SignInForm } from "@/features/identity/sign-in-form";
import { getCurrentSession } from "@/server/auth/session";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getCurrentSession();

  if (session) {
    redirect("/app");
  }

  return (
    <main className="flex min-h-svh w-full items-center justify-center px-6 py-16">
      <SignInForm
        googleEnabled={Boolean(
          serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET,
        )}
        oauthError={(await searchParams).error}
      />
    </main>
  );
}
