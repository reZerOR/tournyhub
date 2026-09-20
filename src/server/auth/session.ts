import { headers } from "next/headers";
import { cache } from "react";

import { auth } from "@/server/auth/auth";
import { isUserSuspended } from "@/server/auction-query/administration";
import { getPool } from "@/server/database/pool";

/**
 * The current session, or null when there is none. A suspended User's session
 * no longer resolves, so every page and action that already treats null as
 * "sign in" refuses a suspended account without needing its own check.
 */
export const getCurrentSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  if (await isUserSuspended(getPool(), session.user.id)) return null;
  return session;
});
