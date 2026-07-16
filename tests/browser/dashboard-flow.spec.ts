import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDatabase } from "../../packages/db/src/client.js";

const databaseUrl = process.env.E2E_DATABASE_URL;

async function removeFixture(
  connection: ReturnType<typeof createDatabase>,
  email: string,
) {
  const client = await connection.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL hypergendoc.allow_purge = 'on'");
    await client.query(
      'DELETE FROM workspaces WHERE id IN (SELECT m.workspace_id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = $1)',
      [email],
    );
    await client.query('DELETE FROM "user" WHERE email = $1', [email]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await connection.pool.end();
  }
}

test("public entry points and protected-route redirect are accessible", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Make every generated document feel considered.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  await page.goto("/workspace/documents");
  await expect(page).toHaveURL(/\/login\?next=%2Fworkspace%2Fdocuments$/);
});

test.describe("verified account dashboard journey", () => {
  test.skip(!databaseUrl, "E2E_DATABASE_URL is required");

  test("registers, verifies, signs in, and creates a workspace", async ({
    page,
  }) => {
    const run = randomBytes(8).toString("hex");
    const email = `browser-${run}@example.test`;
    const password = `Browser-${run}-password`;
    const connection = createDatabase({ connectionString: databaseUrl! });

    try {
      await page.goto("/register");
      await page.getByLabel("Name").fill("Browser Owner");
      await page.getByLabel("Work email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(
        page.getByText("Check your email for the next step."),
      ).toBeVisible();

      const verified = await connection.pool.query(
        'UPDATE "user" SET email_verified = true WHERE email = $1 RETURNING id',
        [email],
      );
      expect(verified.rowCount).toBe(1);

      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/workspace$/);

      await page.goto("/setup");
      await page.getByLabel("Workspace name").fill(`Browser Agency ${run}`);
      await page.getByRole("button", { name: "Create workspace" }).click();
      await expect(page).toHaveURL(/\/workspace$/);
      await expect(
        page.getByRole("heading", { name: "The document desk." }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Documents" }).click();
      await expect(page).toHaveURL(/\/workspace\/documents$/);
      await expect(
        page.getByRole("heading", { name: "Immutable render history." }),
      ).toBeVisible();
      await expect(page.getByText("No matching documents")).toBeVisible();
    } finally {
      await removeFixture(connection, email);
    }
  });
});
