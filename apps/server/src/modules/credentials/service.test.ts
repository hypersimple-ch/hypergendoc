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
const audit: AuditWriter = {
  write: async (event) => {
    audits.push(event);
  },
};
function repository(): CredentialRepository & { rows: CredentialRecord[] } {
  const rows: CredentialRecord[] = [];
  const result: CredentialRepository & { rows: CredentialRecord[] } = {
    rows,
    transaction: async (work) => work(result),
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
    replaceScopes: async () => undefined,
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
      audit,
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
      audit,
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
      audit,
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
});
