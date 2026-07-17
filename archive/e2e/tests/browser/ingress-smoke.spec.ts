import { expect, test } from "@playwright/test";

const e2eOrigin = process.env.E2E_ORIGIN;
const appOrigin = process.env.APP_ORIGIN;

test("ingress serves the web root and routes server endpoints", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Make every generated document feel considered.",
    }),
  ).toBeVisible();

  const health = await page.request.get("/health/live");
  expect(health.status()).toBe(200);
  expect(health.headers()["content-type"]).toContain("application/json");
  expect(await health.json()).toEqual({ status: "ok" });

  const api = await page.request.get("/api/workspaces/current");
  expect(api.status()).toBe(401);
  expect(api.headers()["content-type"]).toContain("application/json");
});

test("rejects E2E-origin mutations when APP_ORIGIN differs", async ({
  page,
}) => {
  test.skip(
    !e2eOrigin || !appOrigin,
    "E2E_ORIGIN and APP_ORIGIN are required to check origin configuration",
  );
  test.skip(
    new URL(e2eOrigin!).origin === new URL(appOrigin!).origin,
    "APP_ORIGIN matches E2E_ORIGIN; there is no mismatched-origin rejection to check",
  );

  // Origin policy rejects this before authentication or database access. Do not
  // add a same-origin mutation here: browser smoke tests must be safe by default.
  const response = await page.request.post("/api/companies", {
    data: { name: "must-not-be-created" },
    headers: { Origin: new URL(e2eOrigin!).origin },
  });
  expect(response.status()).toBe(403);
  expect(response.headers()["content-type"]).toContain("application/json");
});
