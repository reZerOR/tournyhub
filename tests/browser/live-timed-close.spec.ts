import { expect, test } from "./fixtures";

import {
  currentCountdown,
  offerRandomPlayer,
  resetRunningAuctions,
  setupLiveAuction,
  waitForCountdownBelow,
} from "./live-helpers";

test.beforeEach(resetRunningAuctions);

test("runs a database countdown to an Unsold outcome that a refresh cannot change", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const setup = await setupLiveAuction(browser, page, {
    closeMode: "Timed Close",
    timedCloseSeconds: "8",
    title: "Timed Close Auction",
  });

  try {
    await offerRandomPlayer(page);
    await expect(page.getByText(/Timed Close in/)).toBeVisible();
    await expect(
      setup.redsRepPage.getByRole("button", { name: /^Bid \d+$/ }),
    ).toBeVisible({ timeout: 20_000 });

    // A console that cannot reach the server keeps showing Finalizing instead
    // of announcing an outcome of its own.
    await setup.redsRepPage.context().setOffline(true);
    await expect(setup.redsRepPage.getByText("Finalizing…")).toBeVisible({
      timeout: 30_000,
    });

    // Reconnecting fetches the committed Unsold result.
    await setup.redsRepPage.context().setOffline(false);
    await setup.redsRepPage.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await expect(setup.redsRepPage.getByText("No Active Player.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("No Active Player.")).toBeVisible({
      timeout: 30_000,
    });

    // Refreshing cannot change the committed outcome.
    await page.reload();
    await expect(page.getByText("No Active Player.")).toBeVisible();
    await expect(page.getByText(/Revision \d+/).first()).toBeVisible();
  } finally {
    await setup.dispose();
  }
});

test("moves the Timed Close deadline when a Bid arrives in the final seconds", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const setup = await setupLiveAuction(browser, page, {
    closeMode: "Timed Close",
    timedCloseSeconds: "20",
    title: "Anti Snipe Auction",
  });

  try {
    await offerRandomPlayer(page);
    await expect(
      setup.redsRepPage.getByRole("button", { name: /^Bid \d+$/ }),
    ).toBeVisible({ timeout: 20_000 });

    // Bid inside the final five seconds, which resets the deadline.
    await waitForCountdownBelow(page, 3);
    await setup.redsRepPage.getByRole("button", { name: /^Bid \d+$/ }).click();
    await expect(
      setup.redsRepPage.getByText("Your Team leads this Player."),
    ).toBeVisible({ timeout: 20_000 });

    // The stored deadline moved to database time plus five seconds, so a
    // freshly loaded console still has more than three seconds left.
    await page.reload();
    await expect(page.getByText(/Timed Close in/)).toBeVisible();
    expect(await currentCountdown(page)).toBeGreaterThan(3);

    // The Sale still resolves once that moved deadline passes.
    await expect(page.getByText("No Active Player.")).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await setup.dispose();
  }
});
