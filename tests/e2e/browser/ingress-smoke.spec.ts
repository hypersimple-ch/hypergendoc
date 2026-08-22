import { expect, test } from "@playwright/test";

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
