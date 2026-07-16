import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { AgentActor } from "../modules/auth/actors.js";
import { AppError } from "../platform/errors.js";
import { createInMemoryRateLimiter } from "../platform/rate-limit.js";
import { createMcpPlugin, type DomainServices } from "./index.js";

const actor: AgentActor = {
  credentialId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  allowedCompanyIds: ["33333333-3333-4333-8333-333333333333"],
  actions: [
    "companies:read",
    "styles:read",
    "documents:read",
    "documents:write",
  ],
  requestId: "request-123",
};

const services: DomainServices = {
  listCompanies: vi.fn(() => Promise.resolve({ items: [] })),
  listStyles: vi.fn(() => Promise.resolve({ items: [] })),
  listDocuments: vi.fn(() => Promise.resolve({ items: [] })),
  getDocument: vi.fn(() => Promise.reject(new AppError("not_found", 404))),
  getDocumentVersion: vi.fn(() =>
    Promise.reject(new AppError("not_found", 404)),
  ),
  createDocument: vi.fn(() =>
    Promise.reject(new AppError("render_failed", 502)),
  ),
  createDocumentVersion: vi.fn(() =>
    Promise.reject(new AppError("render_failed", 502)),
  ),
};

function request(method: string, params: unknown, id = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

function appFor(token = "valid-token") {
  const app = Fastify();
  app.register(
    createMcpPlugin({
      services,
      credentialVerifier: {
        verify: vi.fn((value) =>
          Promise.resolve(value === token ? actor : null),
        ),
      },
      rateLimiter: createInMemoryRateLimiter(),
    }),
  );
  return app;
}

async function post(
  app: ReturnType<typeof appFor>,
  body: unknown,
  token = "valid-token",
) {
  return app.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    payload: JSON.stringify(body),
  });
}

function mcpJson(response: { body: string }) {
  const data = response.body.match(/^data: (.*)$/m)?.[1];
  return JSON.parse(data ?? response.body) as {
    result: {
      isError?: boolean;
      tools: { name: string }[];
      structuredContent: unknown;
    };
  };
}

describe("MCP Streamable HTTP adapter", () => {
  it("requires a bearer credential on every HTTP method without leaking it", async () => {
    const app = appFor("secret-token");
    const unauthenticated = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: request("initialize", {}),
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.headers["www-authenticate"]).toContain("Bearer");
    expect(unauthenticated.body).not.toContain("secret-token");
    expect((await app.inject({ method: "GET", url: "/mcp" })).statusCode).toBe(
      401,
    );
    expect(
      (await app.inject({ method: "DELETE", url: "/mcp" })).statusCode,
    ).toBe(401);
    await app.close();
  });

  it("supports stateless initialize, tool discovery, and calls", async () => {
    const app = appFor();
    const initialize = await post(
      app,
      request("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      }),
    );
    expect(initialize.statusCode).toBe(200);
    const listed = await post(app, request("tools/list", {}));
    expect(listed.statusCode).toBe(200);
    expect(mcpJson(listed).result.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["list_companies", "create_document_version"]),
    );
    const called = await post(
      app,
      request("tools/call", { name: "list_companies", arguments: {} }),
    );
    expect(called.statusCode).toBe(200);
    expect(mcpJson(called).result.structuredContent).toEqual({ items: [] });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/mcp",
          headers: { authorization: "Bearer valid-token" },
        })
      ).statusCode,
    ).toBe(405);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/mcp",
          headers: { authorization: "Bearer valid-token" },
        })
      ).statusCode,
    ).toBe(405);
    await app.close();
  });

  it("lets the SDK reject malformed tool input and returns safe domain failures", async () => {
    const app = appFor();
    const malformed = await post(
      app,
      request("tools/call", {
        name: "list_styles",
        arguments: { companyId: "not-a-uuid", extra: true },
      }),
    );
    expect(malformed.statusCode).toBe(200);
    expect(mcpJson(malformed).result.isError).toBe(true);
    const forbiddenTarget = await post(
      app,
      request("tools/call", {
        name: "get_document",
        arguments: { documentId: "44444444-4444-4444-8444-444444444444" },
      }),
    );
    expect(forbiddenTarget.body).toContain("not_found");
    expect(forbiddenTarget.body).not.toContain("valid-token");
    const renderFailure = await post(
      app,
      request("tools/call", {
        name: "create_document_version",
        arguments: {
          documentId: "44444444-4444-4444-8444-444444444444",
          body: "Rendered body",
        },
      }),
    );
    expect(renderFailure.body).toContain("render_failed");
    await app.close();
  });

  it("enforces action scopes before invoking domain services", async () => {
    const app = Fastify();
    app.register(
      createMcpPlugin({
        services,
        credentialVerifier: {
          verify: vi.fn(() =>
            Promise.resolve({ ...actor, actions: ["companies:read"] as const }),
          ),
        },
        rateLimiter: createInMemoryRateLimiter(),
      }),
    );
    const response = await post(
      app,
      request("tools/call", {
        name: "list_styles",
        arguments: { companyId: "33333333-3333-4333-8333-333333333333" },
      }),
    );
    expect(response.body).toContain("forbidden");
    await app.close();
  });

  it("checks revoked credentials and rate limits each stateless request", async () => {
    const app = Fastify();
    app.register(
      createMcpPlugin({
        services,
        credentialVerifier: { verify: vi.fn(() => Promise.resolve(null)) },
        rateLimiter: createInMemoryRateLimiter(),
      }),
    );
    expect((await post(app, request("tools/list", {}))).statusCode).toBe(401);
    await app.close();

    const limited = Fastify();
    limited.register(
      createMcpPlugin({
        services,
        credentialVerifier: { verify: vi.fn(() => Promise.resolve(actor)) },
        rateLimiter: createInMemoryRateLimiter(),
        rateLimit: 1,
      }),
    );
    expect((await post(limited, request("tools/list", {}))).statusCode).toBe(
      200,
    );
    expect((await post(limited, request("tools/list", {}))).statusCode).toBe(
      429,
    );
    await limited.close();
  });
});
