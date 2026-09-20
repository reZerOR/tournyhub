import type { Browser, BrowserContext, Page } from "@playwright/test";
import { Pool } from "pg";

import { expect } from "./fixtures";
import {
  addPlayerEntry,
  addTeam,
  assignPlayerRepresentative,
  createDraftAuction,
  signIn,
  uniqueEmail,
} from "./helpers";

/**
 * The beta permits exactly one Live Auction across the whole service. A browser
 * test that leaves one running would block the next one, so every live spec
 * returns any leftover running Auction to Draft before it starts.
 */
export async function resetRunningAuctions(): Promise<void> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });
  try {
    await pool.query(
      `update "auction" set "status" = 'draft'
        where "status" in ('live', 'paused')`,
    );
  } finally {
    await pool.end();
  }
}

export interface LiveBrowserSetup {
  auctionTitle: string;
  bluesRepPage: Page;
  organizerPage: Page;
  redsRepPage: Page;
  /** Closes the Representative browser contexts this setup opened. */
  dispose: () => Promise<void>;
}

/**
 * Walks the whole Draft-to-Live path in the browser: an Organizer creates a
 * Simple-Rules Auction, adds Players and Teams, assigns two Player
 * Representatives, saves Rules, and starts it. Both Representative consoles
 * are already signed in and sitting on the dashboard.
 */
export async function setupLiveAuction(
  browser: Browser,
  organizerPage: Page,
  {
    closeMode = "Manual Close",
    players = ["Alice", "Bob", "Carol", "Dave"],
    representatives = ["Alice", "Bob"],
    timedCloseSeconds,
    title,
  }: {
    closeMode?: "Manual Close" | "Timed Close";
    players?: string[];
    representatives?: [string, string];
    timedCloseSeconds?: string;
    title: string;
  },
): Promise<LiveBrowserSetup> {
  const redsEmail = uniqueEmail("live-reds");
  const bluesEmail = uniqueEmail("live-blues");
  const redsContext: BrowserContext = await browser.newContext();
  const bluesContext: BrowserContext = await browser.newContext();

  await signIn(await redsContext.newPage(), redsEmail);
  await signIn(await bluesContext.newPage(), bluesEmail);

  await signIn(organizerPage, uniqueEmail("live-organizer"));
  await createDraftAuction(organizerPage, { closeMode, title });

  await organizerPage.getByRole("link", { name: "Players" }).click();
  await expect(organizerPage).toHaveURL(/\/setup\/players$/);
  for (const name of players) {
    await addPlayerEntry(organizerPage, name);
  }

  await organizerPage.getByRole("link", { name: "Teams", exact: true }).click();
  await expect(organizerPage).toHaveURL(/\/setup\/teams$/);
  await addTeam(organizerPage, "Reds");
  await addTeam(organizerPage, "Blues");

  await organizerPage.getByRole("link", { name: "Representatives" }).click();
  await expect(organizerPage).toHaveURL(/\/setup\/representatives$/);
  await assignPlayerRepresentative(
    organizerPage,
    "Reds",
    representatives[0],
    redsEmail,
  );
  await assignPlayerRepresentative(
    organizerPage,
    "Blues",
    representatives[1],
    bluesEmail,
  );

  await organizerPage.getByRole("link", { name: "Rules" }).click();
  await expect(organizerPage).toHaveURL(/\/setup\/rules$/);
  await organizerPage.getByLabel("Budget").fill("100");
  await organizerPage.getByLabel("Bid Increment").fill("5");
  await organizerPage.getByLabel("Minimum Roster size").fill("2");
  await organizerPage.getByLabel("Maximum Roster size").fill("3");
  await organizerPage.getByLabel("Default Starting Price").fill("10");
  if (timedCloseSeconds) {
    await organizerPage
      .getByLabel("Timed Close (seconds)")
      .fill(timedCloseSeconds);
  }
  await organizerPage.getByRole("button", { name: "Save Rules" }).click();
  await expect(organizerPage.getByRole("status")).toHaveText("Saved");

  await organizerPage.getByRole("link", { name: "Readiness" }).click();
  await expect(organizerPage).toHaveURL(/\/setup\/readiness$/);
  await expect(
    organizerPage.getByText("Every requirement holds. This Auction is Ready."),
  ).toBeVisible();
  await organizerPage.getByRole("button", { name: "Start Auction" }).click();
  await expect(organizerPage).toHaveURL(/\/app$/);

  const redsRepPage = await redsContext.newPage();
  const bluesRepPage = await bluesContext.newPage();
  for (const repPage of [redsRepPage, bluesRepPage]) {
    await repPage.goto("/app");
    await repPage.getByRole("link", { name: new RegExp(title) }).click();
    await expect(repPage).toHaveURL(/\/live$/);
  }

  await organizerPage.getByRole("link", { name: new RegExp(title) }).click();
  await expect(organizerPage).toHaveURL(/\/live$/);

  return {
    auctionTitle: title,
    bluesRepPage,
    dispose: async () => {
      await redsContext.close();
      await bluesContext.close();
    },
    organizerPage,
    redsRepPage,
  };
}

/** Offers the next Player at random and waits for the Active Player card. */
export async function offerRandomPlayer(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Random Player" }).click();
  await expect(page.getByText("No Active Player.")).toBeHidden();
}

/** Waits until the displayed Timed Close countdown falls below `seconds`. */
export async function waitForCountdownBelow(
  page: Page,
  seconds: number,
  timeout = 30_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const text = await page
          .getByText(/Timed Close in/)
          .first()
          .textContent()
          .catch(() => null);
        const value = text?.match(/([\d.]+)s/);
        return value ? Number(value[1]) : Number.POSITIVE_INFINITY;
      },
      { timeout },
    )
    .toBeLessThan(seconds);
}

/** The Timed Close countdown in seconds, or Infinity when it is not shown. */
export async function currentCountdown(page: Page): Promise<number> {
  const text = await page
    .getByText(/Timed Close in/)
    .first()
    .textContent()
    .catch(() => null);
  const value = text?.match(/([\d.]+)s/);
  return value ? Number(value[1]) : Number.POSITIVE_INFINITY;
}
