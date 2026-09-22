import { expect, test } from "./fixtures";

import {
  addPlayerEntry,
  addTeam,
  assignPlayerRepresentative,
  signIn,
  uniqueEmail,
} from "./helpers";

const OUT = ".impeccable/review/after";
const DESKTOP = { height: 1000, width: 1440 };

/** The Next.js dev indicator is dev-server chrome, not the design. */
const HIDE_DEV_CHROME =
  "nextjs-portal,[data-nextjs-dialog],#nextjs-dev-indicator,[aria-label='Next.js DevTools']{display:none!important}";

async function shoot(
  page: import("@playwright/test").Page,
  name: string,
  {
    fullPage = true,
    height = DESKTOP.height,
    width = DESKTOP.width,
  }: { fullPage?: boolean; height?: number; width?: number } = {},
) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(400);
  await page.screenshot({ fullPage, path: `${OUT}/${name}.png` });
  // The walk continues at desktop width: below `lg` the sidebar navigation
  // moves into a Sheet, and the next step needs the open rail.
  await page.setViewportSize(DESKTOP);
}

/**
 * Captures every Setup station so the redesign can be reviewed against the
 * screenshots rather than from memory. Tiered Rules are used so all seven
 * stations exist, and the walk runs all the way to Ready so the launch gate
 * is caught in both of its states.
 */
test("capture the setup console shots", async ({ browser, page }) => {
  // A cold `next dev` compiles each station's route on first visit, so this
  // walkthrough is budgeted for a route-by-route build, not for the tour.
  test.setTimeout(300_000);

  const redsEmail = uniqueEmail("shots-reds");
  const bluesEmail = uniqueEmail("shots-blues");
  const redsContext = await browser.newContext();
  const bluesContext = await browser.newContext();

  try {
    await signIn(await redsContext.newPage(), redsEmail);
    await signIn(await bluesContext.newPage(), bluesEmail);

    await signIn(page, uniqueEmail("shots-organizer"));
    await page.goto("/app/auctions/new");
    await expect(
      page.getByRole("heading", { name: "New Auction", exact: true }),
    ).toBeVisible();
    await page.addStyleTag({ content: HIDE_DEV_CHROME });
    await shoot(page, "new-auction-desktop");
    await shoot(page, "new-auction-mobile", { width: 390, height: 844 });

    // Already on the New Auction route, so the plate is filled in place.
    await page.getByLabel("Title").fill("Screenshot Draft");
    await page.getByLabel("Game").fill("Chess");
    await page.getByRole("button", { name: "Tiered Rules" }).click();
    await page.getByRole("button", { name: "Manual Close" }).click();
    await page.getByRole("button", { name: "Create Draft Auction" }).click();
    await expect(page).toHaveURL(/\/app\/auctions\/[^/]+\/setup\/basics$/);

    /*
      Readiness reports the whole gate rather than one group of requirements,
      so it cannot show a satisfied lamp beside an Auction that cannot start.
    */
    await expect(
      page
        .locator("li")
        .filter({ hasText: "Readiness" })
        .locator("[data-slot=station-lamp]"),
    ).toHaveAttribute("data-state", "pending");

    await shoot(page, "basics-desktop");
    await shoot(page, "basics-mobile", { width: 390, height: 844 });

    await page.getByRole("link", { name: "Players" }).click();
    await expect(page).toHaveURL(/\/setup\/players$/);
    for (const name of ["Alice", "Bob", "Carol", "Dave"]) {
      await addPlayerEntry(page, name);
    }
    await shoot(page, "players-desktop");
    await shoot(page, "players-mobile", { width: 390, height: 844 });

    await page.getByRole("link", { name: "Teams", exact: true }).click();
    await expect(page).toHaveURL(/\/setup\/teams$/);
    await addTeam(page, "Reds");
    await addTeam(page, "Blues");
    await shoot(page, "teams-desktop");

    await page.getByRole("link", { name: "Representatives" }).click();
    await expect(page).toHaveURL(/\/setup\/representatives$/);
    await assignPlayerRepresentative(page, "Reds", "Alice", redsEmail);
    await assignPlayerRepresentative(page, "Blues", "Bob", bluesEmail);
    await shoot(page, "representatives-desktop");

    await page.getByRole("link", { name: "Rules" }).click();
    await expect(page).toHaveURL(/\/setup\/rules$/);
    await page.getByLabel("Budget").fill("100");
    await page.getByLabel("Bid Increment").fill("5");
    await page.getByLabel("Minimum Roster size").fill("2");
    await page.getByLabel("Maximum Roster size").fill("3");
    await page.getByRole("button", { name: "Save Rules" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved");
    await shoot(page, "rules-desktop");

    await page.getByRole("link", { name: "Tiers" }).click();
    await expect(page).toHaveURL(/\/setup\/tiers$/);
    await page.getByLabel("New Tier name").fill("Gold");
    await page.locator("#new-tier-price").fill("50");
    await page.locator("#new-tier-min").fill("1");
    await page.locator("#new-tier-max").fill("2");
    await page.getByRole("button", { name: "Add Tier" }).click();
    await expect(page.locator("#new-tier-label")).toHaveValue("");

    // Every biddable Player needs a Tier before a Tiered Auction can start.
    for (const name of ["Carol", "Dave"]) {
      const row = page
        .locator("li")
        .filter({ hasText: name })
        .filter({ has: page.locator("select") });
      await row.locator("select").selectOption({ label: "Gold" });
      await expect(row.locator("select option:checked")).toHaveText("Gold");
    }
    await shoot(page, "tiers-desktop");

    await page.getByRole("link", { name: "Readiness" }).click();
    await expect(page).toHaveURL(/\/setup\/readiness$/);
    await expect(
      page.getByText("Every requirement holds. This Auction is Ready."),
    ).toBeVisible();
    await shoot(page, "readiness-desktop");
    await shoot(page, "readiness-mobile", { width: 390, height: 844 });

    /*
      Back to a station already visited: Setup is a shared layout, so its lamps
      and gate have to re-read on every move rather than replay whatever the
      station looked like the first time it was opened.
    */
    await page.getByRole("link", { name: "Basics" }).click();
    await expect(page).toHaveURL(/\/setup\/basics$/);
    await expect(page.getByText("Ready to start")).toBeVisible();
    await shoot(page, "basics-ready-desktop");
    await shoot(page, "basics-ready-mobile", { width: 390, height: 844 });

    await expect(
      page.getByRole("button", { name: "Start Auction" }),
    ).toBeEnabled();
  } finally {
    await redsContext.close();
    await bluesContext.close();
  }
});
