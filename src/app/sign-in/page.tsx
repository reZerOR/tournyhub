import { redirect } from "next/navigation";

import { serverEnv } from "@/config/server-env";
import { SignInForm } from "@/features/identity/sign-in-form";
import { getCurrentSession } from "@/server/auth/session";

/** Only a relative application path is accepted, so `next` cannot redirect off-site. */
function safeNext(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.startsWith("/") && !value.startsWith("//") ? value : undefined;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const session = await getCurrentSession();
  const { error, next } = await searchParams;
  const target = safeNext(next);

  if (session) {
    redirect(target ?? "/app");
  }

  return (
    <main className="flex min-h-svh w-full items-center justify-center px-6 py-16">
      <SignInForm
        googleEnabled={Boolean(
          serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET,
        )}
        next={target}
        oauthError={error}
      />
    </main>
  );
}
