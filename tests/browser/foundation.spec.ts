import { expect, test } from "./fixtures";

test("the landing page explains auctions and offers a path to create one", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /HOST THE GAME.*RUN THE AUCTION/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create an auction" }).first(),
  ).toHaveAttribute("href", "/app/auctions/new");
  await page.getByText("Are bids made with real money?").click();
  await expect(
    page.getByText(/Teams bid with virtual Credits that have no cash value/),
  ).toBeVisible();
});
