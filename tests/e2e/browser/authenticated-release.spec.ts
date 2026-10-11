import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test.use({ trace: "off", screenshot: "off" });

function sql(statement: string): void {
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      process.env.POSTGRES_USER ?? "hypergendoc",
      "-d",
      process.env.POSTGRES_DB ?? "hypergendoc",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      statement,
    ],
    { stdio: "pipe" },
  );
}

test("disposable verified account reaches every protected workspace route", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const run = randomBytes(8).toString("hex");
  const email = `release-${run}@example.test`;
  const password = `Release-${run}-password`;
  try {
    await page.goto("/register");
    await page.getByLabel("Name").fill("Release Gate");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password").fill(password);
    const registration = page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/sign-up/email") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create account" }).click();
    expect((await registration).ok()).toBe(true);
    await expect(
      page.getByText(/Verification email accepted for delivery/),
    ).toBeVisible();

    sql(`UPDATE "user" SET email_verified = true WHERE email = '${email}'`);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/setup$/);
    await page.getByLabel("Workspace name").fill(`Release Workspace ${run}`);
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/workspace$/);

    await page.setViewportSize({ width: 320, height: 300 });
    const menu = page.getByRole("button", { name: "Open workspace navigation" });
    const brandBounds = await page.getByRole("link", { name: "HyperGenDoc overview" }).boundingBox();
    const menuBounds = await menu.boundingBox();
    if (!brandBounds || !menuBounds) throw new Error("Mobile header controls must be visible");
    expect(brandBounds.x + brandBounds.width).toBeLessThanOrEqual(menuBounds.x);
    await page.locator("main").ariaSnapshot();
    await menu.scrollIntoViewIfNeeded();
    await menu.click();
    const navigation = page.getByRole("dialog", { name: "Workspace navigation" });
    const companies = navigation.getByRole("link", { name: "Companies", exact: true });
    await navigation.ariaSnapshot();
    await companies.scrollIntoViewIfNeeded();
    await companies.click();
    await expect(page).toHaveURL(/\/workspace\/companies$/);
    await expect(navigation).toBeHidden();
    await menu.click();
    await expect(navigation).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(navigation).toBeHidden();
    await expect(menu).toBeFocused();
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const route of [
      "/workspace",
      "/workspace/companies",
      "/workspace/documents",
      "/workspace/styles",
      "/workspace/templates",
      "/workspace/members",
      "/workspace/credentials",
      "/workspace/audit",
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(
        new RegExp(`${route.replaceAll("/", "\\/")}$`),
      );
      await expect(page.locator("main")).toBeVisible();
    }
  } finally {
    sql(
      `BEGIN; SET LOCAL hypergendoc.allow_purge = 'on'; DELETE FROM workspaces WHERE id IN (SELECT m.workspace_id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = '${email}'); DELETE FROM mail_jobs WHERE recipient = '${email}'; DELETE FROM "user" WHERE email = '${email}'; COMMIT;`,
    );
  }
});
