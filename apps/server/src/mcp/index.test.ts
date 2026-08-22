import type {
  Company,
  Document,
  DocumentCommit,
  DocumentCurrentSource,
  DocumentDetail,
  Style,
} from "@hypergendoc/contracts";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { AgentActor } from "../modules/auth/actors.js";
import { AuthorizationError } from "../modules/memberships/service.js";
import { AppError } from "../platform/errors.js";
import { createInMemoryRateLimiter } from "../platform/rate-limit.js";
import { createMcpPlugin, type DomainServices } from "./index.js";

const companyId = "33333333-3333-4333-8333-333333333333";
const documentId = "44444444-4444-4444-8444-444444444444";
const styleId = "55555555-5555-4555-8555-555555555555";
const styleVersionId = "66666666-6666-4666-8666-666666666666";
const commitSha = "a".repeat(40);
const timestamp = "2025-01-01T00:00:00.000Z";

const actor: AgentActor = {
  credentialId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  allowedCompanyIds: [companyId],
  actions: [
    "companies:read",
    "styles:read",
    "documents:read",
    "documents:write",
  ],
  requestId: "request-123",
};

const company: Company = {
  id: companyId,
  workspaceId: actor.workspaceId,
  name: "Example Company",
  archivedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const style: Style = {
  id: styleId,
  companyId,
  name: "Example Style",
  activeVersionId: styleVersionId,
  createdAt: timestamp,
};
const document: Document = {
  id: documentId,
  companyId,
  title: "Example Document",
  createdAt: timestamp,
  updatedAt: timestamp,
};
const commit: DocumentCommit = {
  documentId,
  commitSha,
  parentCommitSha: null,
  styleVersionId,
  format: "markdown",
  createdByType: "credential",
  createdById: actor.credentialId,
  createdAt: timestamp,
};
const current: DocumentCurrentSource = {
  commit,
  snapshot: {
    documentId,
    commitSha,
    styleVersionId,
    format: "markdown",
    body: "# Example",
  },
};
const detail: DocumentDetail = { document, current, commits: [commit] };

function servicesFor(overrides: Partial<DomainServices> = {}): DomainServices {
  return {
    listCompanies: vi.fn(() => Promise.resolve({ items: [company] })),
    listStyles: vi.fn(() => Promise.resolve({ items: [style] })),
    listTemplates: vi.fn(() => Promise.resolve({ items: [] })),
    getTemplate: vi.fn(() => Promise.reject(new Error("not configured"))),
    listDocuments: vi.fn(() => Promise.resolve({ items: [document] })),
    getDocument: vi.fn(() => Promise.resolve(detail)),
    createDocument: vi.fn(() => Promise.resolve({ document, current })),
    updateDocument: vi.fn(() => Promise.resolve(current)),
    createTemplateDocument: vi.fn(() => Promise.resolve({ document, current })),
    updateTemplateDocument: vi.fn(() => Promise.resolve(current)),
    listDocumentCommits: vi.fn(() => Promise.resolve({ items: [commit] })),
    readDocumentCommit: vi.fn(() => Promise.resolve(current)),
    revertDocument: vi.fn(() => Promise.resolve(current)),
    ...overrides,
  };
}

function request(method: string, params: unknown, id = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

function appFor(
  token = "test-token",
  services: DomainServices = servicesFor(),
  authenticatedActor: AgentActor = actor,
) {
  const app = Fastify();
  app.register(
    createMcpPlugin({
      services,
      credentialVerifier: {
        verify: vi.fn((value) =>
          Promise.resolve(value === token ? authenticatedActor : null),
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
  token = "test-token",
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

type McpResult = {
  isError?: boolean;
  tools?: { name: string }[];
  structuredContent?: unknown;
  content?: { type: string; text: string }[];
};

function mcpJson(response: { body: string }): { result: McpResult } {
  const data = response.body.match(/^data: (.*)$/m)?.[1];
  return JSON.parse(data ?? response.body) as { result: McpResult };
}

function errorText(response: { body: string }) {
  return mcpJson(response).result.content?.[0]?.text;
}

describe("MCP Streamable HTTP adapter", () => {
  it("requires a bearer credential on every HTTP method without leaking it", async () => {
    const app = appFor();
    const unauthenticated = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: request("initialize", {}),
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.headers["www-authenticate"]).toContain("Bearer");
    expect(unauthenticated.body).not.toContain("test-token");
    expect((await app.inject({ method: "GET", url: "/mcp" })).statusCode).toBe(
      401,
    );
    expect(
      (await app.inject({ method: "DELETE", url: "/mcp" })).statusCode,
    ).toBe(401);
    await app.close();
  });

  it("supports stateless initialize and discovers exactly the current tools", async () => {
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
    expect(mcpJson(listed).result.tools?.map((tool) => tool.name)).toEqual([
      "list_companies",
      "list_styles",
      "list_templates",
      "get_template",
      "list_documents",
      "get_document",
      "create_document",
      "update_document",
      "create_document_from_template",
      "update_template_document",
      "list_document_commits",
      "read_document_commit",
      "revert_document",
    ]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/mcp",
          headers: { authorization: "Bearer test-token" },
        })
      ).statusCode,
    ).toBe(405);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/mcp",
          headers: { authorization: "Bearer test-token" },
        })
      ).statusCode,
    ).toBe(405);
    await app.close();
  });

  it("returns structured content from every tool handler", async () => {
    const app = appFor();
    const calls = [
      ["list_companies", {}, { items: [company] }],
      ["list_styles", { companyId }, { items: [style] }],
      ["list_documents", { companyId }, { items: [document] }],
      ["get_document", { documentId }, detail],
      [
        "create_document",
        {
          companyId,
          styleId,
          title: document.title,
          format: "markdown",
          body: "# Example",
        },
        { document, current },
      ],
      [
        "update_document",
        { documentId, format: "markdown", body: "# Example" },
        current,
      ],
      ["list_document_commits", { documentId }, { items: [commit] }],
      ["read_document_commit", { documentId, commitSha }, current],
      ["revert_document", { documentId, commitSha }, current],
    ] as const;

    for (const [name, arguments_, expected] of calls) {
      const response = await post(
        app,
        request("tools/call", { name, arguments: arguments_ }),
      );
      expect(response.statusCode).toBe(200);
      expect(mcpJson(response).result.structuredContent).toEqual(expected);
    }
    await app.close();
  });

  it("preserves strict tool schemas so the SDK rejects unknown input keys", async () => {
    const listStyles = vi.fn(() => Promise.resolve({ items: [style] }));
    const app = appFor("test-token", servicesFor({ listStyles }));
    const malformed = await post(
      app,
      request("tools/call", {
        name: "list_styles",
        arguments: { companyId, extra: true },
      }),
    );
    expect(malformed.statusCode).toBe(200);
    expect(mcpJson(malformed).result.isError).toBe(true);
    expect(listStyles).not.toHaveBeenCalled();
    await app.close();
  });

  it("accepts a full 256 KiB body in addition to the JSON-RPC envelope", async () => {
    const createDocument = vi.fn(() => Promise.resolve({ document, current }));
    const app = appFor("test-token", servicesFor({ createDocument }));
    // Newlines are JSON-escaped, so this also exercises the parser's
    // worst-case two-byte wire representation for an allowed body character.
    const body = "\n".repeat(256 * 1024);
    const response = await post(
      app,
      request("tools/call", {
        name: "create_document",
        arguments: {
          companyId,
          styleId,
          title: document.title,
          format: "markdown",
          body,
        },
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(mcpJson(response).result.isError).not.toBe(true);
    expect(createDocument).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ body }),
    );
    await app.close();
  });

  it("does not weaken the 256 KiB document body limit", async () => {
    const createDocument = vi.fn(() => Promise.resolve({ document, current }));
    const app = appFor("test-token", servicesFor({ createDocument }));
    const response = await post(
      app,
      request("tools/call", {
        name: "create_document",
        arguments: {
          companyId,
          styleId,
          title: document.title,
          format: "markdown",
          body: "x".repeat(256 * 1024 + 1),
        },
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(mcpJson(response).result.isError).toBe(true);
    expect(createDocument).not.toHaveBeenCalled();
    await app.close();
  });

  it("normalizes domain failures into exact safe tool errors with the request ID", async () => {
    const app = appFor(
      "test-token",
      servicesFor({
        getDocument: vi.fn(() =>
          Promise.reject(new AppError("not_found", 404)),
        ),
        createDocument: vi.fn(() => Promise.reject(new Error("unexpected"))),
        updateDocument: vi.fn(() =>
          Promise.reject(new AppError("render_failed", 502)),
        ),
      }),
    );
    const failures = [
      [
        "get_document",
        { documentId },
        "not_found: Not found (request request-123)",
      ],
      [
        "create_document",
        {
          companyId,
          styleId,
          title: document.title,
          format: "markdown",
          body: "# Example",
        },
        "internal_error: Internal server error (request request-123)",
      ],
      [
        "update_document",
        { documentId, format: "markdown", body: "# Example" },
        "render_failed: Render failed (request request-123)",
      ],
    ] as const;
    for (const [name, arguments_, expected] of failures) {
      const response = await post(
        app,
        request("tools/call", { name, arguments: arguments_ }),
      );
      expect(mcpJson(response).result.isError).toBe(true);
      expect(errorText(response)).toBe(expected);
      expect(response.body).not.toContain("test-token");
    }
    await app.close();
  });

  it("normalizes domain authorization errors into safe tool errors", async () => {
    const app = appFor(
      "test-token",
      servicesFor({
        listStyles: vi.fn(() =>
          Promise.reject(new AuthorizationError("not_found")),
        ),
      }),
    );
    const response = await post(
      app,
      request("tools/call", {
        name: "list_styles",
        arguments: { companyId },
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(errorText(response)).toBe(
      "not_found: Not found (request request-123)",
    );
    expect(response.body).not.toContain("internal_error");
    await app.close();
  });

  it("enforces every action scope before invoking domain services", async () => {
    const deniedServices = {
      listCompanies: vi.fn(() => Promise.resolve({ items: [company] })),
      listStyles: vi.fn(() => Promise.resolve({ items: [style] })),
      getDocument: vi.fn(() => Promise.resolve(detail)),
      createDocument: vi.fn(() => Promise.resolve({ document, current })),
    };
    const app = appFor("test-token", servicesFor(deniedServices), {
      ...actor,
      actions: [],
    });
    const calls = [
      ["list_companies", {}, deniedServices.listCompanies],
      ["list_styles", { companyId }, deniedServices.listStyles],
      ["get_document", { documentId }, deniedServices.getDocument],
      [
        "create_document",
        {
          companyId,
          styleId,
          title: document.title,
          format: "markdown",
          body: "# Example",
        },
        deniedServices.createDocument,
      ],
    ] as const;
    for (const [name, arguments_, service] of calls) {
      const response = await post(
        app,
        request("tools/call", { name, arguments: arguments_ }),
      );
      expect(errorText(response)).toBe(
        "forbidden: Access denied (request request-123)",
      );
      expect(service).not.toHaveBeenCalled();
    }
    await app.close();
  });

  it("checks revoked credentials and rate limits each stateless request", async () => {
    const app = Fastify();
    app.register(
      createMcpPlugin({
        services: servicesFor(),
        credentialVerifier: { verify: vi.fn(() => Promise.resolve(null)) },
        rateLimiter: createInMemoryRateLimiter(),
      }),
    );
    expect((await post(app, request("tools/list", {}))).statusCode).toBe(401);
    await app.close();

    const limited = Fastify();
    limited.register(
      createMcpPlugin({
        services: servicesFor(),
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
