import { expect, test } from "@playwright/test";
import {
  renderTemplateDocumentHtml,
  type RenderTemplateDocumentInput,
} from "../../../packages/document/src/index.js";

test("ingress serves web, security headers, health, and protected redirects", async ({
  page,
}) => {
  const home = await page.goto("/");
  expect(home?.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      name: "Every approved document starts with a system.",
    }),
  ).toBeVisible();
  expect(home?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(home?.headers()["x-content-type-options"]).toBe("nosniff");

  const health = await page.request.get("/health/live");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });

  const api = await page.request.get("/api/workspaces/current");
  expect(api.status()).toBe(401);
  expect((await api.json()).error.code).toBe("unauthenticated");

  await page.goto("/workspace/documents");
  await expect(page).toHaveURL(/\/login\?next=%2Fworkspace%2Fdocuments$/);
});

test("template pages leave unspecified backgrounds transparent and preserve explicit brand fills", async ({ page }) => {
  const input: RenderTemplateDocumentInput = {
    definition: {
      schemaVersion: 1,
      styleVersionId: "00000000-0000-4000-8000-000000000010",
      fields: {},
      pageMasters: { standard: {} },
      document: [{
        type: "page",
        master: "standard",
        children: [{ type: "paragraph", content: [{ type: "text", value: "Readable report text" }] }],
      }],
    },
    data: {},
    style: {
      logoObjectId: null,
      bodyFont: "Inter",
      headingFont: "Inter",
      bodySizePt: 10,
      headingScale: 1.5,
      italicStyle: "italic",
      colors: { text: "#202020", heading: "#202020", primary: "#3157c8", accent: "#80a3ed", muted: "#6b7280" },
      page: { size: "A4", marginTopMm: 20, marginRightMm: 20, marginBottomMm: 20, marginLeftMm: 20 },
      header: { enabled: false, leftText: "", centerText: "", rightText: "", showPageNumber: false },
      footer: { enabled: false, leftText: "", centerText: "", rightText: "", showPageNumber: false },
    },
  };
  await page.setContent(renderTemplateDocumentHtml(input));
  const report = page.getByText("Readable report text", { exact: true });
  await expect(report).toBeVisible();
  const canvas = report.locator("..");
  await expect(canvas).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(report).toHaveCSS("color", "rgb(32, 32, 32)");
  input.definition.pageMasters.standard = { background: "accent" };
  await page.setContent(renderTemplateDocumentHtml(input));
  await expect(page.getByText("Readable report text", { exact: true }).locator("..")).toHaveCSS("background-color", "rgb(128, 163, 237)");
});
