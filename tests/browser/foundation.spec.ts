import { expect, test } from "@playwright/test";

test("the TournyHub foundation is available", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "TournyHub" }),
  ).toBeVisible();
  await expect(
    page.getByText("Live player Auctions, built for fairness."),
  ).toBeVisible();
});
