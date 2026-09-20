import { expect, test } from "./fixtures";

import {
  offerRandomPlayer,
  resetRunningAuctions,
  setupLiveAuction,
} from "./live-helpers";

test.beforeEach(resetRunningAuctions);
test.afterAll(resetRunningAuctions);

test("drives the Organizer console by keyboard and announces material changes", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const setup = await setupLiveAuction(browser, page, {
    title: "Keyboard Auction",
  });

  try {
    // The console loads its eligible Players in its first client effect, so
    // waiting for them proves the console is hydrated and its keyboard
    // controls are attached.
    await expect(
      page.getByRole("combobox", { name: "Next Player" }).locator("option"),
    ).toHaveCount(3, { timeout: 20_000 });

    // "n" offers a random Player without touching the mouse, and the change is
    // announced politely.
    await page.keyboard.press("n");
    await expect(page.getByText(/is now the Active Player\./)).toBeAttached({
      timeout: 20_000,
    });
    await expect(page.getByText("No Active Player.")).toBeHidden();

    // A shortcut must not fire while the Organizer is typing.
    const reason = page.getByLabel("Return reason");
    await reason.fill("pnc");
    await expect(reason).toHaveValue("pnc");
    await expect(
      page.getByRole("heading", { name: "Live Auction" }),
    ).toBeVisible();

    await reason.fill("");
    await page.locator("body").click();

    // "p" pauses and resumes, and each change is announced.
    await page.keyboard.press("p");
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("The Auction is paused.")).toBeAttached();
    await page.keyboard.press("p");
    await expect(
      page.getByRole("heading", { name: "Live Auction" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText("The Auction is running again."),
    ).toBeAttached();

    // "c" starts the Manual Close warning, whose countdown is not a live region
    // and therefore never announces each tick.
    await page.keyboard.press("c");
    const countdown = page.getByText(/Closing in/);
    await expect(countdown).toBeAttached({ timeout: 20_000 });
    await expect(countdown).not.toHaveAttribute("aria-live", /.*/);

    // Sounds are off until the User opts in, and the choice is remembered.
    const sounds = page.getByRole("switch", {
      name: "Live sounds (off by default)",
    });
    await expect(sounds).not.toBeChecked();
    await sounds.click();
    await expect(sounds).toBeChecked();
    await page.reload();
    await expect(
      page.getByRole("switch", { name: "Live sounds (off by default)" }),
    ).toBeChecked();
  } finally {
    await setup.dispose();
  }
});

test("keeps the representative's primary action visible on a phone-sized screen", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const setup = await setupLiveAuction(browser, page, {
    title: "Phone Console Auction",
  });

  try {
    await offerRandomPlayer(page);
    await setup.redsRepPage.setViewportSize({ width: 375, height: 667 });

    await expect(setup.redsRepPage.getByText("Active Player")).toBeVisible();
    await expect(
      setup.redsRepPage.getByRole("button", { name: /^Bid \d+$/ }),
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    await setup.dispose();
  }
});
