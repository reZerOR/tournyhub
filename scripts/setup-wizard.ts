import { createInterface } from "node:readline/promises";

/**
 * The operator setup wizard.
 *
 * Some beta provisioning cannot be automated: creating Supabase projects,
 * Google OAuth clients, a Gmail app password, and Vercel environment values all
 * happen in provider dashboards. This wizard walks the operator through those
 * steps, checks that the right variable names are present without ever echoing
 * a value, and ends with the connection checks that can be automated.
 *
 * Usage: pnpm setup:wizard
 */
interface WizardStep {
  detail: string;
  id: string;
  requiredVariables: string[];
  title: string;
}

export const WIZARD_STEPS: WizardStep[] = [
  {
    detail:
      "Create one Supabase project for development and one for production, in a region near the participants. Development is where you test; production holds real Auctions.",
    id: "supabase-projects",
    requiredVariables: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "DATABASE_URL",
    ],
    title: "Supabase projects",
  },
  {
    detail:
      "Create a Google OAuth client for each environment and register `<app url>/api/auth/callback/google` as an authorized redirect URI.",
    id: "google-oauth",
    requiredVariables: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    title: "Google OAuth clients",
  },
  {
    detail:
      "Create a dedicated Gmail account and an app password. Do not log the password anywhere, and never paste it into a ticket.",
    id: "gmail-smtp",
    requiredVariables: [
      "EMAIL_FROM",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASSWORD",
    ],
    title: "Gmail SMTP",
  },
  {
    detail:
      "Set the application URL, the Better Auth secret (at least 32 characters), and the environment name. Declare the production database URL everywhere so a Preview deployment cannot reach it.",
    id: "application-secrets",
    requiredVariables: [
      "NEXT_PUBLIC_APP_URL",
      "BETTER_AUTH_SECRET",
      "APP_ENVIRONMENT",
      "PRODUCTION_DATABASE_URL",
    ],
    title: "Application secrets",
  },
  {
    detail:
      "Provision the first Platform Administrator with `pnpm admin:bootstrap`, then remove PLATFORM_ADMIN_BOOTSTRAP_EMAIL. The command refuses to run twice.",
    id: "administrator",
    requiredVariables: ["PLATFORM_ADMIN_BOOTSTRAP_EMAIL"],
    title: "First Platform Administrator",
  },
];

export interface VariableCheck {
  missing: string[];
  present: string[];
}

/**
 * Reports which expected variable names are configured. It deliberately returns
 * names only: the wizard must never print a value.
 */
export function checkVariableNames(
  step: WizardStep,
  environment: Record<string, string | undefined>,
): VariableCheck {
  const present: string[] = [];
  const missing: string[] = [];
  for (const name of step.requiredVariables) {
    const value = environment[name];
    if (typeof value === "string" && value.trim().length > 0)
      present.push(name);
    else missing.push(name);
  }
  return { missing, present };
}

async function main() {
  const interactive = process.stdin.isTTY;
  if (!interactive) {
    console.info(
      "Run this wizard from an interactive terminal. It prints the provider steps and checks variable names only.",
    );
  }

  const readline = interactive
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;

  try {
    for (const step of WIZARD_STEPS) {
      console.info(
        `\n${step.title}\n${"-".repeat(step.title.length)}\n${step.detail}`,
      );
      const status = checkVariableNames(step, process.env);
      console.info(
        status.present.length > 0
          ? `  Configured: ${status.present.join(", ")}`
          : "  Configured: none",
      );
      if (status.missing.length > 0) {
        console.info(`  Still to set: ${status.missing.join(", ")}`);
      }
      if (readline) {
        await readline.question("  Press Enter when this step is done. ");
      }
    }
  } finally {
    readline?.close();
  }

  console.info(
    "\nNext: run `pnpm env:check`, `pnpm migrate:status`, then `pnpm check` from a clean checkout.",
  );
}

// Only run when invoked as a script, so the helpers stay importable by tests.
if (process.argv[1]?.includes("setup-wizard")) {
  main().catch((error: unknown) => {
    console.error(
      `Setup wizard failed: ${error instanceof Error ? error.message : "unknown failure"}`,
    );
    process.exitCode = 1;
  });
}
