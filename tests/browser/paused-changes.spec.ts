import { expect, test } from "./fixtures";

import { signIn, uniqueEmail } from "./helpers";
import { resetRunningAuctions, setupLiveAuction } from "./live-helpers";

test.beforeEach(resetRunningAuctions);
test.afterAll(resetRunningAuctions);

test("replaces a representative while Paused and strips the former representative", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const setup = await setupLiveAuction(browser, page, {
    title: "Replacement Auction",
  });
  const replacementEmail = uniqueEmail("manage-replacement");
  const replacementContext = await browser.newContext();
  const replacementPage = await replacementContext.newPage();

  try {
    await signIn(replacementPage, replacementEmail);

    await page.getByRole("button", { name: "Pause Auction" }).click();
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();

    await page
      .getByRole("link", { name: "Open Manage Auction for paused changes" })
      .click();
    await expect(page).toHaveURL(/\/manage$/);

    await page.getByLabel("Reason for this change").fill("Personnel change");
    const redsRow = page
      .locator("li")
      .filter({ hasText: "Reds" })
      .filter({ has: page.getByLabel("Representative email") });
    await redsRow.getByLabel("Representative email").fill(replacementEmail);
    await redsRow
      .getByRole("button", { name: "Replace representative" })
      .click();
    await expect(page.getByText("Representative replaced.")).toBeVisible();

    // The former Representative loses the live console on the next request.
    await setup.redsRepPage.reload();
    await expect(
      setup.redsRepPage.getByRole("heading", { name: "Your Team" }),
    ).toBeHidden();
    await expect(
      setup.redsRepPage.getByText(/This page is not available/),
    ).toBeVisible({
      timeout: 20_000,
    });

    // The replacement holds the Team's controls.
    await replacementPage.goto("/app");
    await replacementPage
      .getByRole("link", { name: /Replacement Auction/ })
      .click();
    await expect(replacementPage).toHaveURL(/\/live$/);
    await expect(
      replacementPage.getByRole("heading", { name: "Your Team" }),
    ).toBeVisible();
  } finally {
    await replacementContext.close();
    await setup.dispose();
  }
});

test("increases every Budget equally and cancels the Auction while Paused", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const setup = await setupLiveAuction(browser, page, {
    title: "Paused Change Auction",
  });

  try {
    await page.getByRole("button", { name: "Pause Auction" }).click();
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();

    await page
      .getByRole("link", { name: "Open Manage Auction for paused changes" })
      .click();
    await expect(page).toHaveURL(/\/manage$/);

    await page.getByLabel("Reason for this change").fill("Planning mistake");
    await page.getByLabel("Increase by").fill("25");
    await page.getByRole("button", { name: "Increase every Budget" }).click();
    await expect(
      page.getByText("Every Team's Budget increased."),
    ).toBeVisible();

    // Every Team sees the same increase on its console.
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("link", { name: /Paused Change Auction/ }).click();
    await expect(page).toHaveURL(/\/live$/);
    const redsRow = page.locator("li").filter({ hasText: "Reds" });
    await expect(redsRow.getByText(/Remaining 125/)).toBeVisible({
      timeout: 20_000,
    });

    // Cancellation is deliberate, Paused-only, and permanent.
    await page
      .getByRole("link", { name: "Open Manage Auction for paused changes" })
      .click();
    await page.getByLabel("Reason for this change").fill("Called off");
    await page.getByRole("button", { name: "Cancel Auction" }).click();
    await expect(
      page.getByRole("heading", { name: "Auction cancelled" }),
    ).toBeVisible();

    await page.goto(page.url().replace(/\/manage$/, "/live"));
    await expect(page.getByText(/This page is not available/)).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await setup.dispose();
  }
});
