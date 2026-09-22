import { expect, test } from "./fixtures";
import { signIn, uniqueEmail } from "./helpers";

test("verify mobile close section renders clean", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, uniqueEmail("verify-mobile"));
  await page.goto("/app/auctions/new");
  await expect(
    page.getByRole("heading", { name: "New Auction", exact: true }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Timed Close" })
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ".impeccable/review/mobile-verify.png" });

  await page.getByRole("button", { name: "Timed Close" }).click();
  await expect(
    page.getByRole("button", { name: "Timed Close" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "Start a fresh Draft", exact: true }),
  ).toBeVisible();

  // A console of dense fields must not scroll sideways on a phone.
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
