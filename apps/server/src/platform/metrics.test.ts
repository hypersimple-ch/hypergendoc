import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerSafeErrorHandler } from "./errors.js";
import { createServerMetrics } from "./metrics.js";

const baseEnv = {
  APP_ORIGIN: "https://docs.example.test",
  BETTER_AUTH_SECRET: "auth-secret",
  CREDENTIAL_PEPPER: "credential-pepper",
  DATABASE_URL: "postgresql://database",
  DOCUMENT_GIT_ROOT: "/var/lib/hypergendoc/git",
  S3_REGION: "us-east-1",
  S3_BUCKET: "private",
  S3_ACCESS_KEY: "access",
  S3_SECRET_KEY: "secret",
};

afterEach(() => vi.unstubAllEnvs());

describe("server metrics", () => {
  it("defaults METRICS_ENABLED to off and rejects unknown values", async () => {
    const { loadServerEnvironment } = await import("./env.js");
    expect(loadServerEnvironment(baseEnv).metricsEnabled).toBe(false);
    expect(
      loadServerEnvironment({ ...baseEnv, METRICS_ENABLED: "true" })
        .metricsEnabled,
    ).toBe(true);
    expect(() =>
      loadServerEnvironment({ ...baseEnv, METRICS_ENABLED: "yes" }),
    ).toThrow("METRICS_ENABLED");
  });

  it("keeps /metrics absent when the endpoint is disabled", async () => {
    const app = Fastify();
    registerSafeErrorHandler(app);
    const metrics = createServerMetrics();
    metrics.register(app, { enabled: false });
    app.get("/health/live", () => ({ status: "ok" }));
    const response = await app.inject({ method: "GET", url: "/metrics" });
    expect(response.statusCode).toBe(404);
    // Instrumentation still runs; the scrape surface simply does not exist.
    await app.inject({ method: "GET", url: "/health/live" });
    expect(metrics.render()).toContain('http_requests_total{method="GET"');
    await app.close();
  });

  it("serves Prometheus text families when enabled", async () => {
    const app = Fastify();
    registerSafeErrorHandler(app);
    const metrics = createServerMetrics();
    metrics.recordRender("ok");
    metrics.recordRender("error");
    metrics.recordGitMutation("write");
    metrics.register(app, { enabled: true });
    app.get("/api/templates/:templateId/preview", () => ({ ok: true }));
    app.get("/api/templates/:templateId", () => ({ ok: true }));

    const first = await app.inject({
      method: "GET",
      url: "/api/templates/9f1c3b2a-1111-4111-8111-000000000001/preview",
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: "GET", url: "/nope" });
    expect(second.statusCode).toBe(404);

    const response = await app.inject({ method: "GET", url: "/metrics" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    const body = response.body;
    for (const familyName of [
      "http_requests_total",
      "document_renders_total",
      "git_mutations_total",
      "process_uptime_seconds",
    ])
      expect(body).toContain(`# TYPE ${familyName}`);
    expect(body).toContain(
      'document_renders_total{outcome="ok"} 1',
    );
    expect(body).toContain('git_mutations_total{operation="write"} 1');
    expect(Number(body.match(/process_uptime_seconds ([\d.]+)/)?.[1])).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it("labels requests by route template instead of raw identifiers and counts repeats", async () => {
    const app = Fastify();
    registerSafeErrorHandler(app);
    const metrics = createServerMetrics();
    metrics.register(app, { enabled: true });
    app.get("/api/templates/:templateId", () => ({ ok: true }));
    const templateId = "9f1c3b2a-2222-4222-8222-000000000002";
    for (let index = 0; index < 3; index++)
      await app.inject({
        method: "GET",
        url: `/api/templates/${templateId}`,
      });

    const body = createServerMetricsScrape(app);
    expect(await body).toContain(
      `http_requests_total{method="GET",route="/api/templates/:templateId",status="200"} 3`,
    );
    expect(await body).not.toContain(templateId);
    await app.close();

    function createServerMetricsScrape(target: typeof app): Promise<string> {
      return target
        .inject({ method: "GET", url: "/metrics" })
        .then((response) => response.body);
    }
  });
});
