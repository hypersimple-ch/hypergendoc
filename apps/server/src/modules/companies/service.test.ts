/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it, vi } from "vitest";
import type { Company } from "@hypergendoc/contracts";
import type { AuditWriter } from "../../platform/audit.js";
import type { HumanActor } from "../auth/actors.js";
import { createCompanyService, type CompanyRepository } from "./service.js";

const owner: HumanActor = {
  userId: "user",
  workspaceId: "workspace-a",
  membershipId: "membership",
  role: "owner",
  requestId: "request",
};
const archived: Company = {
  id: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  name: "Acme",
  archivedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function dependencies() {
  const restore = vi.fn(async (workspaceId: string, companyId: string) =>
    workspaceId === owner.workspaceId && companyId === archived.id
      ? { ...archived, archivedAt: null }
      : undefined,
  );
  const write = vi.fn<AuditWriter["write"]>(async () => undefined);
  const repository: CompanyRepository = {
    transaction: async (work) => work(repository, { write }),
    list: async () => [],
    find: async () => undefined,
    create: async () => archived,
    update: async () => undefined,
    archive: async () => undefined,
    restore,
  };
  return { repository, restore, write };
}

describe("company restore", () => {
  it("restores an archived company in the actor workspace and audits the transition", async () => {
    const deps = dependencies();
    const service = createCompanyService({
      repository: deps.repository,
    });

    await expect(service.restore(owner, archived.id)).resolves.toMatchObject({
      id: archived.id,
      archivedAt: null,
    });
    expect(deps.restore).toHaveBeenCalledWith(owner.workspaceId, archived.id);
    expect(deps.write).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "company.restored",
        targetId: archived.id,
      }),
    );
  });

  it("keeps restore owner-only and reports missing records", async () => {
    const deps = dependencies();
    const service = createCompanyService({
      repository: deps.repository,
    });

    await expect(
      service.restore({ ...owner, role: "member" }, archived.id),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.restore(owner, "missing")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
