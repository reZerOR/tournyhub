import nextEnv from "@next/env";
import { defineConfig, devices } from "@playwright/test";

nextEnv.loadEnvConfig(process.cwd());

const port = 3100;
// Point the suite at an already-running dev server (for example the one on
// http://localhost:3000 during local development) instead of starting one.
// The origin must match NEXT_PUBLIC_APP_URL so Better Auth accepts requests.
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  globalSetup: "./tests/browser/global-setup.ts",
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  // The beta permits exactly one Live Auction across the whole service, so two
  // browser tests cannot be Live at the same time. One worker keeps the suite
  // honest about that rule; each live spec also clears any leftover running
  // Auction before it starts.
  workers: 1,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: `pnpm dev --hostname 127.0.0.1 --port ${port}`,
        env: {
          ...process.env,
          BETTER_AUTH_SECRET:
            process.env.BETTER_AUTH_SECRET ??
            "browser-test-secret-of-32-chars!!",
          DATABASE_URL:
            process.env.DATABASE_URL ??
            "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
          GOOGLE_CLIENT_ID:
            process.env.GOOGLE_CLIENT_ID ?? "browser-test-google-client-id",
          GOOGLE_CLIENT_SECRET:
            process.env.GOOGLE_CLIENT_SECRET ?? "browser-test-google-secret",
          NEXT_PUBLIC_APP_URL: baseURL,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
            "browser-test-publishable-key",
          NEXT_PUBLIC_SUPABASE_URL:
            process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
          SUPABASE_SERVICE_ROLE_KEY:
            process.env.SUPABASE_SERVICE_ROLE_KEY ??
            "browser-test-service-role-key",
        },
        reuseExistingServer: !process.env.CI,
        url: baseURL,
      },
});
