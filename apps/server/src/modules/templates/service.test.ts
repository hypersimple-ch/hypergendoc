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
import { starterTemplates } from "./starter-catalog.js";

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
    transaction: async (work) => work(result, audit),
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
    findActive: async (workspaceId, templateId) =>
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

const auditEvents: string[] = [];
const audit: AuditWriter = {
  write: async (event) => {
    auditEvents.push(event.event);
  },
};

describe("template versions", () => {
  it("creates immutable versions and atomically activates the requested version", async () => {
    const service = createTemplateService({
      repository: repository(),
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

  it("passes the stored definition locale to draft previews", async () => {
    const seen: TemplateDefinition[] = [];
    const service = createTemplateService({
      repository: repository(),
      renderer: {
        renderPreview: async (input) => {
          seen.push(input.definition);
          return { url: "preview" };
        },
      },
    });
    const created = await service.create(actor, {
      companyId: "company-a",
      name: "Localized template",
      definition: { ...definition, locale: "fr-FR" },
    });
    await service.preview(actor, created.template.id, {
      versionId: created.version.id,
      data: { title: "Aperçu" },
    });
    expect(seen[0]?.locale).toBe("fr-FR");
  });

  it("creates an inactive template version from a starter with a pinned style", async () => {
    const service = createTemplateService({
      repository: repository(),
      renderer: { renderPreview: async () => ({ url: "preview" }) },
    });
    auditEvents.length = 0;
    const result = await service.createFromStarter(actor, {
      companyId: "company-a",
      starterId: "one-page-proposal",
      name: "Client proposals",
      styleVersionId,
    });
    expect(result.template.activeVersionId).toBeNull();
    expect(result.version.version).toBe(1);
    const starterDefinition = starterTemplates.find(
      (starter) => starter.id === "one-page-proposal",
    )!.definition;
    expect(result.version.definition).toEqual({
      ...starterDefinition,
      styleVersionId,
    });
    expect(auditEvents).toEqual(["template.created_from_starter"]);
    // The catalog stays untouched by instantiation.
    expect(starterTemplates[0]!.definition.styleVersionId).toBe(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(starterTemplates[0]!.id).toBe("one-page-proposal");
  });

  it("rejects unknown starters and foreign style pins for from-starter creation", async () => {
    const service = createTemplateService({
      repository: repository(),
      renderer: { renderPreview: async () => ({ url: "preview" }) },
    });
    await expect(
      service.createFromStarter(actor, {
        companyId: "company-a",
        starterId: "does-not-exist",
        name: "Nope",
        styleVersionId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      service.createFromStarter(actor, {
        companyId: "company-a",
        starterId: "one-page-proposal",
        name: "Foreign style",
        styleVersionId: "00000000-0000-4000-8000-000000000002",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      service.createFromStarter(actor, {
        companyId: "company-b",
        starterId: "one-page-proposal",
        name: "Foreign company",
        styleVersionId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("duplicates the latest version into a new inactive template copy", async () => {
    const service = createTemplateService({
      repository: repository(),
      renderer: { renderPreview: async () => ({ url: "preview" }) },
    });
    auditEvents.length = 0;
    const created = await service.create(actor, {
      companyId: "company-a",
      name: "Reusable template",
      definition,
    });
    const changed: TemplateDefinition = {
      ...definition,
      description: "Second version",
    };
    const second = await service.createVersion(actor, created.template.id, {
      ...changed,
    }, false);
    const copy = await service.duplicate(actor, created.template.id);
    expect(copy.template.name).toBe("Reusable template (copy)");
    expect(copy.template.companyId).toBe("company-a");
    expect(copy.template.activeVersionId).toBeNull();
    expect(copy.version.definition.description).toBe("Second version");
    expect(copy.version.definition.styleVersionId).toBe(styleVersionId);
    // The source stays untouched; its first version remains the active one
    // because the extra version was created without activation.
    expect((await service.get(actor, created.template.id)).activeVersionId).toBe(
      created.version.id,
    );
    const sourceVersions = await service.history(actor, created.template.id);
    expect(sourceVersions.map((item) => item.version)).toEqual([1, 2]);
    void second;
    expect(auditEvents).toEqual([
      "template.created",
      "template.version_created",
      "template.duplicated",
    ]);
  });

  it("masks duplicates of missing or archived templates", async () => {
    const repo = repository();
    const service = createTemplateService({
      repository: {
        ...repo,
        findActive: async (_workspaceId, templateId) =>
          templateId === "archived" ? undefined : repo.findActive(_workspaceId, templateId),
      },
      renderer: { renderPreview: async () => ({ url: "preview" }) },
    });
    await expect(service.duplicate(actor, "missing")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(service.duplicate(actor, "archived")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("rejects definitions whose style version is outside the template company", async () => {
    const service = createTemplateService({
      repository: repository(),
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
