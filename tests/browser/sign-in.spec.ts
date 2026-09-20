import { expect, test } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

function uniqueEmail(label: string): string {
  return `browser-otp-${label}-${Date.now()}-${Math.floor(
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
    if (body.otp) {
      return body.otp;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`No OTP was recorded for ${email}`);
}

test("a new user can register and sign in with an emailed code", async ({
  page,
}) => {
  const email = uniqueEmail("register");

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByLabel("Code")).toBeVisible();
  const otp = await readOtp(page.request, email);

  await page.getByLabel("Code").fill(otp);
  await page.getByRole("button", { name: "Verify and sign in" }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(email)).toBeVisible();
});

test("an incorrect code shows an inline error and does not sign in", async ({
  page,
}) => {
  const email = uniqueEmail("invalid");

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();

  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Verify and sign in" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("resending a code is disabled during the cooldown", async ({ page }) => {
  const email = uniqueEmail("cooldown");

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();

  await expect(
    page.getByRole("button", { name: /Resend code in/ }),
  ).toBeDisabled();
});

test("visiting the private area while signed out returns to sign-in", async ({
  page,
}) => {
  await page.goto("/app");

  await expect(page).toHaveURL(/\/sign-in$/);
});

test("a signed-in user can sign out from the private area", async ({
  page,
}) => {
  const email = uniqueEmail("signout");

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();
  const otp = await readOtp(page.request, email);
  await page.getByLabel("Code").fill(otp);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in$/);
});
