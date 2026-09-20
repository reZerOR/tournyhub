import { Pool } from "pg";

import { expect, test } from "./fixtures";

import { signIn, uniqueEmail } from "./helpers";

async function latestFeedback(email: string): Promise<{
  category: string;
  message: string;
  page: string;
} | null> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });
  try {
    const result = await pool.query<{
      category: string;
      message: string;
      page: string;
    }>(
      `select f."category", f."message", f."page"
         from "feedback" f join "user" u on u."id" = f."user_id"
        where u."email" = $1
        order by f."created_at" desc limit 1`,
      [email],
    );
    return result.rows[0] ?? null;
  } finally {
    await pool.end();
  }
}

test("sends feedback from the current page and refuses an unauthenticated User", async ({
  browser,
  page,
}) => {
  const email = uniqueEmail("feedback-user");
  await signIn(page, email);

  // The form is reachable from the dashboard without leaving it.
  await page.getByText("Beta feedback").click();
  await page.getByLabel("Category").selectOption("confusing");
  await page
    .getByLabel("What happened?")
    .fill("The Active Player was hard to find on my phone.");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(
    page.getByText("Thank you. Your report was recorded."),
  ).toBeVisible();

  const report = await latestFeedback(email);
  expect(report).toMatchObject({
    category: "confusing",
    message: "The Active Player was hard to find on my phone.",
    page: "/app",
  });

  // An unauthenticated visitor is redirected away from the feedback route.
  const anonymous = await browser.newContext();
  const anonymousPage = await anonymous.newPage();
  try {
    await anonymousPage.goto("/app/feedback");
    await expect(anonymousPage).toHaveURL(/\/sign-in/);
  } finally {
    await anonymous.close();
  }
});

test("keeps the send button disabled until the message is long enough", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("feedback-limits"));
  await page.goto("/app/feedback");

  const send = page.getByRole("button", { name: "Send feedback" });
  await expect(send).toBeDisabled();
  await page.getByLabel("What happened?").fill("too short");
  await expect(send).toBeDisabled();
  await page
    .getByLabel("What happened?")
    .fill("This message is long enough to send.");
  await expect(send).toBeEnabled();
});
