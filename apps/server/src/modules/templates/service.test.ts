/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from "vitest";
import type {
  Template,
  TemplateDefinition,
  TemplateVersion,
} from "@hypergendoc/contracts";
import type { AuditWriter } from "../../platform/audit.js";
import type { HumanActor } from "../auth/actors.js";
import { createTemplateService, type TemplateRepository } from "./service.js";

const actor: HumanActor = {
  userId: "user",
  workspaceId: "workspace-a",
  membershipId: "membership",
  role: "member",
  requestId: "request",
};

const styleVersionId = "00000000-0000-4000-8000-000000000001";
const definition: TemplateDefinition = {
  schemaVersion: 1,
  styleVersionId,
  fields: { title: { type: "text", label: "Title", required: true } },
  pageMasters: { default: {} },
  document: [
    {
      type: "page",
      master: "default",
      children: [
        {
          type: "heading",
          content: [{ type: "binding", path: "title" }],
        },
      ],
    },
  ],
};

function repository(): TemplateRepository {
  const templates: Template[] = [];
  const versions: TemplateVersion[] = [];
  const result: TemplateRepository = {
    transaction: async (work) => work(result),
    companyExists: async (workspaceId, companyId) =>
      workspaceId === "workspace-a" && companyId === "company-a",
    styleVersionBelongsToCompany: async (workspaceId, companyId, versionId) =>
      workspaceId === "workspace-a" &&
      companyId === "company-a" &&
      versionId === styleVersionId,
    list: async (workspaceId, companyId) =>
      workspaceId === "workspace-a"
        ? templates.filter((item) => item.companyId === companyId)
        : [],
    find: async (workspaceId, templateId) =>
      workspaceId === "workspace-a"
        ? templates.find((item) => item.id === templateId)
        : undefined,
    listVersions: async (workspaceId, templateId) =>
      workspaceId === "workspace-a"
        ? versions.filter((item) => item.templateId === templateId)
        : [],
    findVersion: async (workspaceId, templateId, versionId) =>
      workspaceId === "workspace-a"
        ? versions.find(
            (item) => item.templateId === templateId && item.id === versionId,
          )
        : undefined,
    createTemplate: async (input) => {
      const created: Template = {
        id: `template-${templates.length}`,
        companyId: input.companyId,
        name: input.name,
        activeVersionId: null,
        archivedAt: null,
        createdAt: new Date().toISOString(),
      };
      templates.push(created);
      return created;
    },
    createNextVersion: async (input) => {
      const created: TemplateVersion = {
        id: `version-${versions.length}`,
        templateId: input.templateId,
        version:
          versions.filter((item) => item.templateId === input.templateId)
            .length + 1,
        definition: structuredClone(input.definition),
        createdByUserId: input.createdByUserId,
        createdAt: new Date().toISOString(),
      };
      versions.push(created);
      return created;
    },
    setActiveVersion: async (workspaceId, templateId, versionId) => {
      const found =
        workspaceId === "workspace-a"
          ? templates.find((item) => item.id === templateId)
          : undefined;
      if (!found) return false;
      found.activeVersionId = versionId;
      return true;
    },
  };
  return result;
}

const audit: AuditWriter = { write: async () => undefined };

describe("template versions", () => {
  it("creates immutable versions and atomically activates the requested version", async () => {
    const service = createTemplateService({
      repository: repository(),
      audit,
      renderer: { renderPreview: async () => ({ url: "preview" }) },
    });
    const created = await service.create(actor, {
      companyId: "company-a",
      name: "Reusable template",
      definition,
    });
    const changed: TemplateDefinition = {
      ...definition,
      description: "Second version",
    };
    const second = await service.createVersion(
      actor,
      created.template.id,
      changed,
      true,
    );
    expect(created.template.activeVersionId).toBe(created.version.id);
    expect(
      (await service.get(actor, created.template.id)).activeVersionId,
    ).toBe(second.id);
    const history = await service.history(actor, created.template.id);
    expect(history.map((item) => item.version)).toEqual([1, 2]);
    expect(history[0]!.definition.description).toBeUndefined();
    expect(history[1]!.definition.description).toBe("Second version");
  });

  it("rejects definitions whose style version is outside the template company", async () => {
    const service = createTemplateService({
      repository: repository(),
      audit,
      renderer: { renderPreview: async () => ({ url: "preview" }) },
    });
    await expect(
      service.create(actor, {
        companyId: "company-a",
        name: "Foreign style",
        definition: {
          ...definition,
          styleVersionId: "00000000-0000-4000-8000-000000000002",
        },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
