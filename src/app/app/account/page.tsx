import { redirect } from "next/navigation";

import { serverEnv } from "@/config/server-env";
import { AccountSettings } from "@/features/identity/account-settings";
import { getCurrentSession } from "@/server/auth/session";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");

  return (
    <AccountSettings
      googleEnabled={Boolean(
        serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET,
      )}
      initialUser={{
        email: session.user.email,
        name: session.user.name,
        soundEnabled: session.user.soundEnabled,
      }}
      oauthError={(await searchParams).error}
    />
  );
}
