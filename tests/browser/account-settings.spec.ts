import { expect, test } from "./fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

function uniqueEmail(label: string): string {
  return `browser-account-${label}-${Date.now()}-${Math.floor(
    Math.random() * 1_000_000,
  )}@example.com`;
}

async function readOtp(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request.get(
      `/api/dev/test-inbox?email=${encodeURIComponent(email)}&type=sign-in`,
    );
    const body = (await response.json()) as { otp: string | null };
    if (body.otp) return body.otp;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`No OTP was recorded for ${email}`);
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();
  await page.getByLabel("Code").fill(await readOtp(page.request, email));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test("a User can update a persistent account profile", async ({ page }) => {
  await signIn(page, uniqueEmail("profile"));
  await page.getByRole("link", { exact: true, name: "Account" }).click();
  await expect(page).toHaveURL(/\/app\/account$/);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("heading", { name: "Preferences" })).toHaveCount(
    0,
  );

  await page.getByLabel("Display name").fill("Tournament Director");
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(page.getByRole("status")).toHaveText("Profile updated.");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue(
    "Tournament Director",
  );
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("a User can inspect sessions and sign out every session", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("sessions"));
  await page.goto("/app/account");

  await expect(
    page.getByRole("heading", { name: "Active sessions" }),
  ).toBeVisible();
  await expect(page.getByText("Current session")).toBeVisible();
  await page.getByRole("button", { name: "Sign out all sessions" }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("a Google callback failure is explained on the sign-in page", async ({
  page,
}) => {
  await page.goto("/sign-in?error=invalid_code");

  await expect(page.getByRole("alert")).toContainText(
    "Google sign-in could not be completed",
  );
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
});
