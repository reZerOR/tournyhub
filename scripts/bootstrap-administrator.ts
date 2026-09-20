import nextEnv from "@next/env";

import { parseEnvironment } from "../src/config/environment";

/**
 * Provisions the very first Platform Administrator from
 * `PLATFORM_ADMIN_BOOTSTRAP_EMAIL`.
 *
 * The value is temporary: `bootstrapAdministrator` refuses to run once any
 * administrator exists, so the same command cannot widen the role later. The
 * operator removes the variable after this succeeds. Nothing here prints a
 * secret, an email, or a credential.
 */
async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  const environment = parseEnvironment(process.env);

  const email = environment.PLATFORM_ADMIN_BOOTSTRAP_EMAIL;
  if (!email) {
    console.error(
      "PLATFORM_ADMIN_BOOTSTRAP_EMAIL is not set. Set it to the operator's email, run this command once, then remove it.",
    );
    process.exitCode = 1;
    return;
  }

  // Imported after the environment loads: these modules parse configuration at
  // import time.
  const { getPool } = await import("../src/server/database/pool");
  const { bootstrapAdministrator } =
    await import("../src/server/auction-command/administration");

  const pool = getPool();
  try {
    const user = await pool.query<{ id: string }>(
      `select "id" from "user" where lower("email") = $1`,
      [email.trim().toLowerCase()],
    );
    const userId = user.rows[0]?.id;
    if (!userId) {
      console.error(
        "No registered User matches PLATFORM_ADMIN_BOOTSTRAP_EMAIL. Ask the operator to sign in once, then run this again.",
      );
      process.exitCode = 1;
      return;
    }

    const result = await bootstrapAdministrator(pool, {
      note: "Initial administrator provisioned by the bootstrap command.",
      userId,
    });
    console.info(
      `Platform Administrator provisioned at ${result.at}. Remove PLATFORM_ADMIN_BOOTSTRAP_EMAIL now.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown failure";
  console.error(`Bootstrap failed: ${message}`);
  process.exitCode = 1;
});
