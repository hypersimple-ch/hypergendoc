import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDatabase } from "../../packages/db/src/client.js";

const databaseUrl = process.env.E2E_DATABASE_URL;

async function removeFixtures(
  connection: ReturnType<typeof createDatabase>,
  emails: string[],
) {
  const client = await connection.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL hypergendoc.allow_purge = 'on'");
    await client.query(
      'DELETE FROM workspaces WHERE id IN (SELECT m.workspace_id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = ANY($1::text[]))',
      [emails],
    );
    await client.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [
      emails,
    ]);
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

  test("registers, verifies, signs in, and creates workspace content", async ({
    browser,
    page,
  }) => {
    test.setTimeout(120_000);
    const run = randomBytes(8).toString("hex");
    const email = `browser-${run}@example.test`;
    const memberEmail = `browser-member-${run}@example.test`;
    const password = `Browser-${run}-password`;
    const memberPassword = `Browser-member-${run}-password`;
    const connection = createDatabase({ connectionString: databaseUrl! });
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();

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
      await expect(page).toHaveURL(/\/setup$/);

      await page.getByLabel("Workspace name").fill(`Browser Agency ${run}`);
      await page.getByRole("button", { name: "Create workspace" }).click();
      await expect(page).toHaveURL(/\/workspace$/);
      await expect(
        page.getByRole("heading", { name: "The document desk." }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Companies" }).click();
      await expect(page).toHaveURL(/\/workspace\/companies$/);
      await expect(
        page.getByRole("heading", { name: "Brand homes." }),
      ).toBeVisible();
      await page.getByLabel("Company name").fill(`Browser Company ${run}`);
      await page.getByRole("button", { name: "Add company" }).click();
      await expect(page.getByText(`Browser Company ${run}`)).toBeVisible();
      await expect(
        page.getByText("Access denied", { exact: false }),
      ).toHaveCount(0);

      await page.getByRole("link", { name: "Styles" }).click();
      await expect(page).toHaveURL(/\/workspace\/styles$/);
      await expect(
        page.getByRole("heading", { name: "Structured brand systems." }),
      ).toBeVisible();
      await page.getByLabel("New style name").fill(`Browser Style ${run}`);
      await page
        .getByRole("combobox", { name: "Company", exact: true })
        .selectOption({ label: `Browser Company ${run}` });
      await page.getByRole("button", { name: "Create style" }).click();
      await expect(
        page.getByRole("heading", { name: `Browser Style ${run}` }),
      ).toBeVisible();
      await expect(
        page.getByText("Access denied", { exact: false }),
      ).toHaveCount(0);

      await page.getByRole("link", { name: "Documents" }).click();
      await expect(page).toHaveURL(/\/workspace\/documents$/);
      await expect(
        page.getByRole("heading", { name: "Immutable render history." }),
      ).toBeVisible();
      await expect(page.getByText("No matching documents")).toBeVisible();
      await page.getByLabel("Render status").selectOption("ready");
      await expect(page.getByText("No matching documents")).toBeVisible();

      await page.getByRole("link", { name: "Styles" }).click();
      await page.getByLabel("New style name").fill(`Invalid Style ${run}`);
      const requiredCompany = page.getByRole("combobox", {
        name: "Company",
        exact: true,
      });
      await page.getByRole("button", { name: "Create style" }).click();
      await expect(requiredCompany).toBeFocused();
      expect(
        await requiredCompany.evaluate(
          (element: HTMLSelectElement) => element.validity.valueMissing,
        ),
      ).toBe(true);

      await page.route("**/api/companies", async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code: "forbidden",
                message: "Access denied",
                requestId: "browser-denied",
              },
            }),
          });
        } else {
          await route.fallback();
        }
      });
      await page.getByRole("link", { name: "Companies" }).click();
      await page.getByLabel("Company name").fill(`Denied ${run}`);
      await page.getByRole("button", { name: "Add company" }).click();
      await expect(page.getByText("Access denied")).toBeVisible();
      await page.unroute("**/api/companies");

      await memberPage.goto("/register");
      await memberPage.getByLabel("Name").fill("Browser Member");
      await memberPage.getByLabel("Work email").fill(memberEmail);
      await memberPage.getByLabel("Password").fill(memberPassword);
      await memberPage.getByRole("button", { name: "Create account" }).click();
      await expect(
        memberPage.getByText("Check your email for the next step."),
      ).toBeVisible();
      const memberVerified = await connection.pool.query(
        'UPDATE "user" SET email_verified = true WHERE email = $1 RETURNING id',
        [memberEmail],
      );
      expect(memberVerified.rowCount).toBe(1);

      await memberPage.goto("/login");
      await memberPage.getByLabel("Email").fill(memberEmail);
      await memberPage.getByLabel("Password").fill(memberPassword);
      await memberPage
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await expect(memberPage).toHaveURL(/\/setup$/);
      await expect(
        memberPage.getByRole("heading", { name: "Name the room." }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Members" }).click();
      await page.getByLabel("Verified account email").fill(memberEmail);
      await page
        .getByRole("combobox", { name: "Role", exact: true })
        .selectOption("member");
      await page.getByRole("button", { name: "Add verified member" }).click();
      await expect(page.getByText("Member added.")).toBeVisible();

      await memberPage.goto("/workspace");
      await expect(memberPage).toHaveURL(/\/workspace$/);
      await memberPage.getByRole("link", { name: "Members" }).click();
      await expect(
        memberPage.getByText(
          "You can view members, but only workspace owners can send invitations or change roles.",
        ),
      ).toBeVisible();
      await expect(
        memberPage.getByRole("button", { name: "Add verified member" }),
      ).toHaveCount(0);

      await page.getByLabel("Role for Browser Member").selectOption("owner");
      await expect(page.getByText("Member role updated.")).toBeVisible();
      await page.getByRole("link", { name: "Audit log" }).click();
      await expect(page.getByText("membership.role_changed")).toBeVisible();

      await page.getByRole("link", { name: "Members" }).click();
      await page.getByLabel("Role for Browser Member").selectOption("member");
      await expect(page.getByText("Member role updated.")).toBeVisible();
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("row", { name: /Browser Member/ })
        .getByRole("button", { name: "Remove" })
        .click();
      await expect(page.getByText("Member removed.")).toBeVisible();

      let failDocumentList = true;
      await page.route("**/api/documents", async (route) => {
        if (failDocumentList) {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code: "dependency_unavailable",
                message: "Unavailable",
                requestId: "browser-unavailable",
              },
            }),
          });
        } else {
          await route.fallback();
        }
      });
      await page.goto("/workspace/documents");
      await expect(page.getByText("Unavailable")).toBeVisible();
      failDocumentList = false;
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(page.getByText("No matching documents")).toBeVisible();
      await page.unroute("**/api/documents");

      const browserDocument = {
        id: "browser-document",
        companyId: "browser-company",
        title: "Browser preview",
        currentVersionId: "browser-version",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      };
      const browserVersion = {
        id: "browser-version",
        documentId: "browser-document",
        version: 2,
        styleVersionId: "browser-style-version",
        body: "Read only",
        status: "ready",
        inputHash: "a".repeat(64),
        sourceHash: "b".repeat(64),
        outputHash: "c".repeat(64),
        rendererVersion: "browser-renderer",
        createdByType: "user",
        createdById: "browser-user",
        createdAt: "2026-01-01T00:00:00.000Z",
      };
      await page.route("**/api/documents", (route) =>
        route.fulfill({ json: [browserDocument] }),
      );
      await page.route("**/api/documents/browser-document", (route) =>
        route.fulfill({
          json: { document: browserDocument, versions: [browserVersion] },
        }),
      );
      await page.reload();
      await page.getByRole("button", { name: "View history" }).click();
      await expect(
        page.getByTitle("Browser preview version 2 PDF preview"),
      ).toHaveAttribute(
        "src",
        "/api/documents/browser-document/versions/2/pdf?disposition=inline",
      );
      await expect(
        page.getByRole("link", { name: "Download PDF" }),
      ).toHaveAttribute(
        "href",
        "/api/documents/browser-document/versions/2/pdf",
      );
      await page.unroute("**/api/documents");
      await page.unroute("**/api/documents/browser-document");

      await page.setViewportSize({ width: 390, height: 844 });
      const menu = page.getByRole("button", { name: "Menu" });
      await expect(menu).toBeVisible();
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await page.getByRole("link", { name: "Companies" }).click();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
    } finally {
      await memberContext.close().catch(() => undefined);
      await removeFixtures(connection, [email, memberEmail]);
    }
  });
});
