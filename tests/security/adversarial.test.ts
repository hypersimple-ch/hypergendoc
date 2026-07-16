import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import type FastifyFactory from "../../apps/server/node_modules/fastify/fastify.js";

// Test files live at the workspace root while Fastify is intentionally scoped to the server package.
const Fastify = createRequire(
  new URL("../../apps/server/package.json", import.meta.url),
)("fastify") as typeof FastifyFactory;
import type {
  AgentActor,
  HumanActor,
} from "../../apps/server/src/modules/auth/actors.js";
import {
  createCredentialService,
  type CredentialRecord,
  type CredentialRepository,
} from "../../apps/server/src/modules/credentials/service.js";
import {
  createMcpPlugin,
  type DomainServices,
} from "../../apps/server/src/mcp/index.js";
import { createInMemoryRateLimiter } from "../../apps/server/src/platform/rate-limit.js";
import { AppError } from "../../apps/server/src/platform/errors.js";

const owner: HumanActor = {
  userId: "owner",
  workspaceId: "tenant-a",
  membershipId: "member-a",
  role: "owner",
  requestId: "request-a",
};
const agent: AgentActor = {
  credentialId: "credential-a",
  workspaceId: "tenant-a",
  allowedCompanyIds: ["33333333-3333-4333-8333-333333333333"],
  actions: ["companies:read"],
  requestId: "request-a",
};
const audit = { write: vi.fn(async () => undefined) };

function repository(): CredentialRepository & { rows: CredentialRecord[] } {
  const rows: CredentialRecord[] = [];
  const repo: CredentialRepository & { rows: CredentialRecord[] } = {
    rows,
    transaction: async (operation) => operation(repo),
    companiesExist: async (workspaceId, ids) =>
      workspaceId === "tenant-a" && ids.every((id) => id === "company-a"),
    insert: async (input) => {
      const row: CredentialRecord = {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        name: input.name,
        prefix: input.lookupPrefix,
        tokenHash: input.tokenHash,
        companyIds: [...input.companyIds],
        actions: [...input.actions],
        expiresAt: input.expiresAt?.toISOString() ?? null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
      };
      rows.push(row);
      return row;
    },
    list: async (workspaceId) =>
      rows.filter((row) => row.workspaceId === workspaceId),
    findByLookupPrefix: async (prefix) =>
      rows.find((row) => row.prefix === prefix),
    find: async (workspaceId, id) =>
      rows.find((row) => row.workspaceId === workspaceId && row.id === id),
    replaceScopes: async () => undefined,
    revoke: async (workspaceId, id, revokedAt) => {
      const row = rows.find(
        (candidate) =>
          candidate.workspaceId === workspaceId && candidate.id === id,
      );
      if (!row) return false;
      row.revokedAt = revokedAt.toISOString();
      return true;
    },
    touchLastUsed: async () => undefined,
  };
  return repo;
}

function mcpApp(verifier = vi.fn(async () => agent)) {
  const services: DomainServices = {
    listCompanies: vi.fn(async () => ({ items: [] })),
    listStyles: vi.fn(async () => ({ items: [] })),
    listDocuments: vi.fn(async () => ({ items: [] })),
    getDocument: vi.fn(async () => {
      throw new AppError("not_found", 404);
    }),
    getDocumentVersion: vi.fn(async () => {
      throw new AppError("not_found", 404);
    }),
    createDocument: vi.fn(async () => {
      throw new AppError("not_found", 404);
    }),
    createDocumentVersion: vi.fn(async () => {
      throw new AppError("not_found", 404);
    }),
  };
  const app = Fastify({ logger: false });
  app.register(
    createMcpPlugin({
      services,
      credentialVerifier: { verify: verifier },
      rateLimiter: createInMemoryRateLimiter(),
      rateLimit: 2,
    }),
  );
  return { app, services };
}

async function mcp(
  app: ReturnType<typeof Fastify>,
  token: string,
  body: unknown,
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

describe("adversarial authorization and credential boundaries", () => {
  it("stores only a keyed hash, rejects tampering/expiry, and applies revocation immediately", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const repo = repository();
    const service = createCredentialService({
      repository: repo,
      audit,
      pepper: "test-pepper",
      now: () => now,
    });
    const created = await service.create(owner, {
      name: "bounded",
      companyIds: ["company-a"],
      actions: ["companies:read"],
      expiresAt: "2026-01-01T00:01:00.000Z",
    });
    expect(repo.rows[0]!.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(repo.rows[0])).not.toContain(created.token);
    await expect(
      service.verify(`${created.token}x`, "tampered"),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.verify(created.token, "before-revoke"),
    ).resolves.toMatchObject({
      allowedCompanyIds: ["company-a"],
      actions: ["companies:read"],
    });
    await service.revoke(owner, created.credential.id);
    await expect(
      service.verify(created.token, "after-revoke"),
    ).rejects.toMatchObject({ code: "forbidden" });
    const expiring = await service.create(owner, {
      name: "expired",
      companyIds: ["company-a"],
      actions: ["companies:read"],
      expiresAt: "2026-01-01T00:01:00.000Z",
    });
    now = new Date("2026-01-01T00:01:00.000Z");
    await expect(
      service.verify(expiring.token, "expired"),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("prevents owner/member escalation and foreign-company scope injection", async () => {
    const service = createCredentialService({
      repository: repository(),
      audit,
      pepper: "test-pepper",
    });
    await expect(
      service.create(
        { ...owner, role: "member" },
        {
          name: "escalation",
          companyIds: ["company-a"],
          actions: ["companies:read"],
        },
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.create(owner, {
        name: "foreign",
        companyIds: ["company-b"],
        actions: ["companies:read"],
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("enforces bearer authentication, action scopes, rate limits, and a 256 KiB request ceiling without token reflection", async () => {
    const { app, services } = mcpApp();
    const request = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "list_styles",
        arguments: { companyId: "33333333-3333-4333-8333-333333333333" },
      },
    };
    const noToken = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(request),
    });
    expect(noToken.statusCode).toBe(401);
    const scoped = await mcp(app, "secret-never-log", request);
    expect(scoped.statusCode).toBe(200);
    expect(scoped.body).toContain("forbidden");
    expect(scoped.body).not.toContain("secret-never-log");
    expect(services.listStyles).not.toHaveBeenCalled();
    const first = await mcp(app, "other", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    const second = await mcp(app, "other", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
    });
    const third = await mcp(app, "other", {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/list",
    });
    expect([first.statusCode, second.statusCode, third.statusCode]).toContain(
      429,
    );
    const { app: sizeApp } = mcpApp();
    const oversized = await mcp(sizeApp, "oversized", {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/list",
      params: { padding: "x".repeat(270_000) },
    });
    expect(oversized.statusCode).toBe(413);
    await sizeApp.close();
    await app.close();
  });
});
