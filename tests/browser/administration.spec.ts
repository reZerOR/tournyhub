import { Pool } from "pg";

import { expect, test } from "./fixtures";

import { createDraftAuction, signIn, uniqueEmail } from "./helpers";

async function grantAdministrator(email: string): Promise<void> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });
  try {
    await pool.query(
      `insert into "platform_administrator" ("user_id")
       select "id" from "user" where "email" = $1
       on conflict ("user_id") do nothing`,
      [email],
    );
  } finally {
    await pool.end();
  }
}

test("moderates a User and an Auction with recorded reasons", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const adminEmail = uniqueEmail("admin-operator");
  await signIn(page, adminEmail);
  await grantAdministrator(adminEmail);

  const organizerContext = await browser.newContext();
  const organizerPage = await organizerContext.newPage();
  const victimContext = await browser.newContext();
  const victimPage = await victimContext.newPage();

  try {
    const organizerEmail = uniqueEmail("admin-target-organizer");
    await signIn(organizerPage, organizerEmail);

    // An ordinary User cannot reach Platform Administration at all.
    await organizerPage.goto("/app/admin");
    await expect(
      organizerPage.getByText(/This page is not available/),
    ).toBeVisible();

    await organizerPage.goto("/app");
    await createDraftAuction(organizerPage, { title: "Moderation Target" });
    const auctionId = new URL(organizerPage.url()).pathname.split("/")[3]!;

    const victimEmail = uniqueEmail("admin-victim");
    await signIn(victimPage, victimEmail);

    // The administrator sees the Administration entry point and its lists.
    await page.goto("/app/admin");
    await expect(
      page.getByRole("heading", { name: "Platform Administration" }),
    ).toBeVisible();

    // Suspending a User requires a reason and revokes their sessions.
    const victimRow = page.locator("li").filter({ hasText: victimEmail });
    await victimRow.getByLabel("Reason").fill("Abusive messages");
    await victimRow.getByRole("button", { name: "Suspend User" }).click();
    await expect(victimRow.getByText("Suspended")).toBeVisible();

    await victimPage.goto("/app");
    await expect(victimPage).toHaveURL(/\/sign-in/);

    // Hiding an Auction removes the Organizer's access.
    const auctionRow = page
      .locator("li")
      .filter({ hasText: "Moderation Target" });
    await auctionRow.getByLabel("Reason").fill("Prohibited content");
    await auctionRow.getByRole("button", { name: "Hide Auction" }).click();
    await expect(auctionRow.getByText("Hidden", { exact: true })).toBeVisible();

    await organizerPage.goto(`/app/auctions/${auctionId}/setup/basics`);
    await expect(
      organizerPage.getByText(/This page is not available/),
    ).toBeVisible();

    // Inspection is reason-gated and the reason is recorded before the summary.
    await page.goto(`/app/admin/auctions/${auctionId}`);
    await page.getByLabel("Moderation reason").fill("User report");
    await page
      .getByRole("button", { name: "Record reason and inspect" })
      .click();
    await expect(
      page.getByRole("region", { name: "Inspection summary" }),
    ).toBeVisible();
    await expect(
      page.getByRole("definition").filter({ hasText: "Moderation Target" }),
    ).toBeVisible();
    await expect(page.getByText(/inspect_auction/)).toBeVisible();

    // Unhiding returns the Auction to its Organizer.
    await page.goto("/app/admin");
    const hiddenRow = page
      .locator("li")
      .filter({ hasText: "Moderation Target" });
    await hiddenRow.getByLabel("Reason").fill("Reviewed and allowed");
    await hiddenRow.getByRole("button", { name: "Unhide Auction" }).click();
    await expect(hiddenRow.getByText("Hidden", { exact: true })).toBeHidden();

    await organizerPage.goto(`/app/auctions/${auctionId}/setup/basics`);
    await expect(organizerPage.getByLabel("Title")).toHaveValue(
      "Moderation Target",
    );
  } finally {
    await victimContext.close();
    await organizerContext.close();
  }
});
