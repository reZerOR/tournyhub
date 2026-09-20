import { expect, test } from "./fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

function uniqueEmail(label: string): string {
  return `browser-auction-${label}-${Date.now()}-${Math.floor(
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

test("the dashboard separates an Organizer's Auctions, Teams, invitations, and archive", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("dashboard"));

  await expect(
    page.getByRole("heading", { name: "Auctions you organize" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Teams you represent" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pending invitations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Archived Auctions" }),
  ).toBeVisible();
  await expect(
    page.getByText("You haven't created an Auction yet."),
  ).toBeVisible();
});

test("an Organizer can create a Draft Auction and its Basics autosave", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("create"));

  await page.getByRole("link", { name: "New Auction" }).click();
  await expect(page).toHaveURL(/\/app\/auctions\/new$/);

  await page.getByLabel("Title").fill("Winter Classic");
  await page.getByLabel("Game").fill("Chess");
  await page.getByRole("button", { name: "Tiered Rules" }).click();
  await page.getByRole("button", { name: "Timed Close" }).click();
  await page.getByRole("button", { name: "Create Draft Auction" }).click();

  await expect(page).toHaveURL(/\/app\/auctions\/[^/]+\/setup\/basics$/);
  await expect(page.getByLabel("Title")).toHaveValue("Winter Classic");
  await expect(page.getByLabel("Game")).toHaveValue("Chess");
  await expect(
    page.getByRole("button", { name: "Tiered Rules" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Timed Close" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("Title").fill("Winter Classic Redux");
  await expect(page.getByRole("status")).toHaveText("Saved", {
    timeout: 5_000,
  });

  await page.reload();
  await expect(page.getByLabel("Title")).toHaveValue("Winter Classic Redux");

  await page.getByRole("link", { name: "Players" }).click();
  await expect(page).toHaveURL(/\/setup\/players$/);
  await expect(page.getByRole("heading", { name: "Players" })).toBeVisible();

  await page.goto("/app");
  await expect(page.getByText("Winter Classic Redux")).toBeVisible();
});

test("an unrelated User cannot open another Organizer's Draft Auction", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("owner"));
  await page.getByRole("link", { name: "New Auction" }).click();
  await page.getByLabel("Title").fill("Private Draft");
  await page.getByLabel("Game").fill("Go");
  await page.getByRole("button", { name: "Create Draft Auction" }).click();
  await expect(page).toHaveURL(/\/app\/auctions\/[^/]+\/setup\/basics$/);
  const draftUrl = page.url();

  await page.context().clearCookies();
  await signIn(page, uniqueEmail("unrelated"));
  await page.goto(draftUrl);

  // A streaming route sends its headers before the page decides the Auction is
  // not visible, so the privacy guarantee is the content, not the status: the
  // unrelated User gets the not-found page and never the Draft's title.
  await expect(
    page.getByRole("heading", { name: "This page is not available" }),
  ).toBeVisible();
  await expect(page.getByText("Private Draft")).toBeHidden();
});
