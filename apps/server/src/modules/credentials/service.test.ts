/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from "vitest";
import type { AuditEvent, AuditWriter } from "../../platform/audit.js";
import type { HumanActor } from "../auth/actors.js";
import {
  createCredentialService,
  type CredentialRecord,
  type CredentialRepository,
} from "./service.js";

const owner: HumanActor = {
  userId: "user",
  workspaceId: "workspace-a",
  membershipId: "membership",
  role: "owner",
  requestId: "request",
};
const audits: AuditEvent[] = [];
let auditFailure = false;
const audit: AuditWriter = {
  write: async (event) => {
    if (auditFailure) throw new Error("injected audit failure");
    audits.push(event);
  },
};
function repository(): CredentialRepository & { rows: CredentialRecord[] } {
  const rows: CredentialRecord[] = [];
  const result: CredentialRepository & { rows: CredentialRecord[] } = {
    rows,
    transaction: async (work) => {
      const before = rows.map((row) => ({
        ...row,
        companyIds: [...row.companyIds],
        actions: [...row.actions],
      }));
      try {
        return await work(result, audit);
      } catch (error) {
        rows.splice(0, rows.length, ...before);
        throw error;
      }
    },
    companiesExist: async (workspaceId, ids) =>
      workspaceId === "workspace-a" && ids.every((id) => id === "company-a"),
    insert: async (input) => {
      const row: CredentialRecord = {
        id: `credential-${rows.length}`,
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
    replaceScopes: async (input) => {
      const row = rows.find(
        (item) =>
          item.workspaceId === input.workspaceId &&
          item.id === input.credentialId,
      );
      if (!row) return undefined;
      row.companyIds = [...input.companyIds];
      row.actions = [...input.actions];
      row.expiresAt = input.expiresAt?.toISOString() ?? null;
      return row;
    },
    revoke: async (workspaceId, id, revokedAt) => {
      const row = rows.find(
        (item) => item.workspaceId === workspaceId && item.id === id,
      );
      if (!row) return false;
      row.revokedAt = revokedAt.toISOString();
      return true;
    },
    touchLastUsed: async (workspaceId, id, usedAt) => {
      const row = rows.find(
        (item) => item.workspaceId === workspaceId && item.id === id,
      );
      if (row) row.lastUsedAt = usedAt.toISOString();
    },
  };
  return result;
}
describe("MCP credentials", () => {
  it("returns an opaque token once while retaining only an HMAC hash", async () => {
    const repo = repository();
    const service = createCredentialService({
      repository: repo,
      pepper: "test-pepper",
    });
    const created = await service.create(owner, {
      name: "agent",
      companyIds: ["company-a"],
      actions: ["companies:read"],
    });
    expect(created.token).toMatch(/^hgd_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/);
    expect(repo.rows[0]).not.toHaveProperty("token");
    expect(repo.rows[0]!.tokenHash).not.toContain(created.token);
    await expect(service.verify(created.token, "next")).resolves.toMatchObject({
      credentialId: created.credential.id,
    });
    expect(repo.rows[0]!.lastUsedAt).not.toBeNull();
    expect(audits.at(-1)).toMatchObject({
      actorType: "credential",
      actorId: created.credential.id,
    });
  });
  it("rejects a revoked credential on the very next verification", async () => {
    const repo = repository();
    const service = createCredentialService({
      repository: repo,
      pepper: "test-pepper",
    });
    const created = await service.create(owner, {
      name: "agent",
      companyIds: ["company-a"],
      actions: ["companies:read"],
    });
    await service.revoke(owner, created.credential.id);
    await expect(service.verify(created.token, "next")).rejects.toMatchObject({
      code: "forbidden",
    });
  });
  it("does not let members manage credentials or scope foreign companies", async () => {
    const repo = repository();
    const service = createCredentialService({
      repository: repo,
      pepper: "test-pepper",
    });
    await expect(
      service.create(
        { ...owner, role: "member" },
        {
          name: "agent",
          companyIds: ["company-a"],
          actions: ["companies:read"],
        },
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.create(owner, {
        name: "agent",
        companyIds: ["company-b"],
        actions: ["companies:read"],
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("updates scopes and expiry while rejecting an already elapsed expiry", async () => {
    const repo = repository();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const service = createCredentialService({
      repository: repo,
      pepper: "test-pepper",
      now: () => now,
    });
    const created = await service.create(owner, {
      name: "agent",
      companyIds: ["company-a"],
      actions: ["companies:read"],
    });
    const expiresAt = new Date("2027-01-01T00:00:00.000Z");

    await expect(
      service.replaceScopes(owner, created.credential.id, {
        companyIds: ["company-a"],
        actions: ["documents:read"],
        expiresAt,
      }),
    ).resolves.toMatchObject({
      actions: ["documents:read"],
      expiresAt: expiresAt.toISOString(),
    });
    await expect(
      service.replaceScopes(owner, created.credential.id, {
        companyIds: ["company-a"],
        actions: ["documents:read"],
        expiresAt: new Date("2025-01-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("rolls credential persistence back when audit creation fails", async () => {
    const repo = repository();
    const service = createCredentialService({
      repository: repo,
      pepper: "pepper",
    });
    auditFailure = true;
    try {
      await expect(
        service.create(owner, {
          name: "CI",
          companyIds: ["company-a"],
          actions: ["documents:read"],
        }),
      ).rejects.toThrow("injected audit failure");
      expect(repo.rows).toHaveLength(0);
    } finally {
      auditFailure = false;
    }
  });
});
