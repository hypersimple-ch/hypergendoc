import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

// This flow creates one-time secrets. Disable traces/screenshots so they can
// never persist a credential token in CI artifacts.
test.use({ trace: "off", screenshot: "off" });

function sql(value: string) {
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "sh",
      "-lc",
      'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ],
    { cwd: process.cwd(), input: value, stdio: ["pipe", "ignore", "pipe"] },
  );
}

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function verify(email: string) {
  sql(`UPDATE "user" SET email_verified = true WHERE email = ${quote(email)};`);
}

function removeFixtures(email: string) {
  const ownerWorkspaces = `(SELECT m.workspace_id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = ${quote(email)})`;
  sql(`BEGIN;
SET LOCAL hypergendoc.allow_purge = 'on';
UPDATE templates SET active_version_id = NULL WHERE workspace_id IN ${ownerWorkspaces};
UPDATE styles SET active_version_id = NULL WHERE workspace_id IN ${ownerWorkspaces};
DELETE FROM documents WHERE workspace_id IN ${ownerWorkspaces};
DELETE FROM template_versions WHERE workspace_id IN ${ownerWorkspaces};
DELETE FROM templates WHERE workspace_id IN ${ownerWorkspaces};
DELETE FROM style_versions WHERE workspace_id IN ${ownerWorkspaces};
DELETE FROM styles WHERE workspace_id IN ${ownerWorkspaces};
DELETE FROM company_fonts WHERE workspace_id IN ${ownerWorkspaces};
DELETE FROM company_colors WHERE workspace_id IN ${ownerWorkspaces};
DELETE FROM stored_objects WHERE workspace_id IN ${ownerWorkspaces};
DELETE FROM workspaces WHERE id IN ${ownerWorkspaces};
DELETE FROM "user" WHERE email = ${quote(email)};
COMMIT;`);
}

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("verified owner completes the governed document and credential journey", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const run = randomBytes(6).toString("hex");
  const email = `browser-${run}@example.test`;
  const password = `Browser-${run}-password!`;
  const workspace = `Browser Agency ${run}`;
  const company = `Browser Company ${run}`;
  const style = `Browser Style ${run}`;
  const template = `Browser Template ${run}`;
  const documentTitle = `Browser Document ${run}`;

  try {
    await page.goto("/register");
    await page.getByLabel("Name").fill("Browser Owner");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password").fill(password);
    const registration = page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/sign-up/email") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create account" }).click();
    expect((await registration).status()).toBe(200);
    await expect(
      page.getByText(/Verification email accepted for delivery/),
    ).toBeVisible();

    verify(email);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/setup$/);
    await page.getByLabel("Workspace name").fill(workspace);
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/workspace$/);

    await page.goto("/workspace/companies");
    await page.getByLabel("Company name").fill(company);
    await page.getByRole("button", { name: "Add company" }).click();
    await expect(
      page.getByLabel("Manage companies").getByText(company),
    ).toBeVisible();
    const logoInput = page
      .getByLabel("Manage companies")
      .getByLabel("Upload logo");
    const logoUpload = page.waitForResponse(
      (response) =>
        response.url().includes("/logo") &&
        response.request().method() === "POST",
    );
    await logoInput.setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: tinyPng,
    });
    expect((await logoUpload).status()).toBe(201);
    await expect(page.getByText("Logo uploaded.")).toBeVisible();

    await page.goto("/workspace/styles");
    await page.getByLabel("New style name").fill(style);
    await page.getByRole("button", { name: "Create style" }).click();
    await expect(page.getByRole("heading", { name: style })).toBeVisible();
    await page.getByRole("button", { name: "Back to style library" }).click();
    await expect(page.getByText(style)).toBeVisible();

    await page.goto("/workspace/templates");
    await page.getByLabel("Template name").fill(template);
    await page
      .getByLabel("Active style", { exact: true })
      .selectOption({ label: style });
    await page.getByRole("button", { name: "Create template" }).click();
    await expect(page).toHaveURL(/\/workspace\/templates\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: template })).toBeVisible();

    await page.goto("/workspace/documents/new");
    await page.getByLabel("Template").selectOption({ label: template });
    await page.getByLabel("Document title").fill(documentTitle);
    await page.getByLabel("Document heading").fill("Governed browser document");
    await page.getByLabel("Document date").fill("2026-08-22");
    await page.getByLabel("Document body").fill("First immutable revision.");
    await page.getByRole("button", { name: "Create document" }).click();
    await expect(page.getByText(/was created successfully/)).toBeVisible();

    await page.goto("/workspace/documents");
    const row = page.getByRole("row", { name: new RegExp(documentTitle) });
    await row.getByRole("button", { name: "View history" }).click();
    await expect(
      page.getByRole("heading", { name: documentTitle }),
    ).toBeVisible();
    await page.getByLabel("Document body").fill("Second immutable revision.");
    await page.getByRole("button", { name: "Commit revision" }).click();
    await expect(
      page.getByText("Template data committed as a new revision."),
    ).toBeVisible();

    const commits = page.getByRole("button", { name: /^Commit [0-9a-f]{8}$/ });
    await expect.poll(() => commits.count()).toBeGreaterThanOrEqual(2);
    const commitCountBeforeRevert = await commits.count();
    await commits.last().click();
    await page.getByRole("button", { name: "Revert as new commit" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Revert as new commit" })
      .click();
    await expect(page.getByText("Reverted as a new commit.")).toBeVisible();
    await expect
      .poll(() => commits.count())
      .toBeGreaterThan(commitCountBeforeRevert);

    await commits.first().click();
    await expect(
      page.getByRole("heading", { name: "Current source" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Preview PDF" }).click();
    const pdf = page.getByTitle(`${documentTitle} current PDF preview`);
    await expect(pdf).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open PDF in a new tab" }),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close dialog" })
      .click();

    await page.goto("/workspace/credentials");
    await page.getByLabel("Credential name").fill(`Browser Agent ${run}`);
    await page.getByLabel(company).check();
    await page.getByLabel("documents:read").check();
    await page.getByRole("button", { name: "Create credential" }).click();
    await expect(page.getByText("Copy this secret now")).toBeVisible();
    await page
      .getByLabel("I have saved this one-time token in a secret manager.")
      .check();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Revoke" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Revoke credential" })
      .click();
    await expect(page.getByText("Credential revoked.")).toBeVisible();

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
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await expect(page.locator("main")).toBeVisible();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workspace/audit");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
    const menu = page.getByRole("button", {
      name: "Open workspace navigation",
    });
    await menu.click();
    await expect(
      page.getByRole("dialog", { name: "Workspace navigation" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Workspace navigation" }),
    ).not.toBeVisible();
    await expect(menu).toBeFocused();
  } finally {
    removeFixtures(email);
  }
});
