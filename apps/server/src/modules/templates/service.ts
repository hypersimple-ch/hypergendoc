import type {
  Template,
  TemplateData,
  TemplateDefinition,
  TemplateVersion,
} from "@hypergendoc/contracts";
import type { AuditWriter } from "../../platform/audit.js";
import { auditActor } from "../../platform/audit.js";
import type { AgentActor, HumanActor } from "../auth/actors.js";
import { AuthorizationError } from "../memberships/service.js";

export interface TemplatePreviewRenderer {
  renderPreview(
    input: Readonly<{
      workspaceId: string;
      companyId: string;
      templateVersionId: string;
      definition: TemplateDefinition;
      data: TemplateData;
    }>,
  ): Promise<Readonly<{ url: string }>>;
}

export interface TemplateRepository {
  transaction<T>(
    operation: (
      repository: TemplateOperations,
      audit: AuditWriter,
    ) => Promise<T>,
  ): Promise<T>;
  companyExists(workspaceId: string, companyId: string): Promise<boolean>;
  /** Proves that a referenced style version is scoped to this company/workspace. */
  styleVersionBelongsToCompany(
    workspaceId: string,
    companyId: string,
    versionId: string,
  ): Promise<boolean>;
  list(workspaceId: string, companyId: string): Promise<readonly Template[]>;
  find(workspaceId: string, templateId: string): Promise<Template | undefined>;
  listVersions(
    workspaceId: string,
    templateId: string,
  ): Promise<readonly TemplateVersion[]>;
  findVersion(
    workspaceId: string,
    templateId: string,
    versionId: string,
  ): Promise<TemplateVersion | undefined>;
  createTemplate(
    input: Readonly<{ workspaceId: string; companyId: string; name: string }>,
  ): Promise<Template>;
  /** Allocates the next immutable version while holding a database lock. */
  createNextVersion(
    input: Readonly<{
      workspaceId: string;
      companyId: string;
      templateId: string;
      definition: TemplateDefinition;
      createdByUserId: string;
    }>,
  ): Promise<TemplateVersion>;
  /** Updates only the template pointer; template_versions are immutable. */
  setActiveVersion(
    workspaceId: string,
    templateId: string,
    versionId: string,
  ): Promise<boolean>;
}

export type TemplateOperations = Omit<TemplateRepository, "transaction">;

export function createTemplateService(deps: {
  repository: TemplateRepository;
  renderer: TemplatePreviewRenderer;
}) {
  async function validateDefinition(
    repository: TemplateOperations,
    actor: HumanActor,
    companyId: string,
    definition: TemplateDefinition,
  ): Promise<void> {
    if (
      !(await repository.styleVersionBelongsToCompany(
        actor.workspaceId,
        companyId,
        definition.styleVersionId,
      ))
    )
      throw new AuthorizationError("not_found");
  }

  const emit = (
    writer: AuditWriter,
    actor: HumanActor,
    event: string,
    templateId: string,
  ) =>
    writer.write({
      workspaceId: actor.workspaceId,
      requestId: actor.requestId,
      event,
      ...auditActor({ type: "human", ...actor }),
      targetType: "template",
      targetId: templateId,
      outcome: "success",
    });

  return {
    async list(
      actor: HumanActor | AgentActor,
      companyId: string,
    ): Promise<readonly Template[]> {
      if (
        !(await deps.repository.companyExists(actor.workspaceId, companyId)) ||
        ("credentialId" in actor &&
          (!actor.actions.includes("templates:read") ||
            !actor.allowedCompanyIds.includes(companyId)))
      )
        throw new AuthorizationError("not_found");
      return deps.repository.list(actor.workspaceId, companyId);
    },

    async get(
      actor: HumanActor | AgentActor,
      templateId: string,
    ): Promise<Template> {
      const template = await deps.repository.find(
        actor.workspaceId,
        templateId,
      );
      if (
        !template ||
        ("credentialId" in actor &&
          (!actor.actions.includes("templates:read") ||
            !actor.allowedCompanyIds.includes(template.companyId)))
      )
        throw new AuthorizationError("not_found");
      return template;
    },

    async history(
      actor: HumanActor | AgentActor,
      templateId: string,
    ): Promise<readonly TemplateVersion[]> {
      await this.get(actor, templateId);
      return deps.repository.listVersions(actor.workspaceId, templateId);
    },

    async create(
      actor: HumanActor,
      input: Readonly<{
        companyId: string;
        name: string;
        definition: TemplateDefinition;
      }>,
    ): Promise<{ template: Template; version: TemplateVersion }> {
      if (
        !(await deps.repository.companyExists(
          actor.workspaceId,
          input.companyId,
        ))
      )
        throw new AuthorizationError("not_found");

      let result: { template: Template; version: TemplateVersion };
      try {
        result = await deps.repository.transaction(
          async (repository, writer) => {
            await validateDefinition(
              repository,
              actor,
              input.companyId,
              input.definition,
            );
            const template = await repository.createTemplate({
              workspaceId: actor.workspaceId,
              companyId: input.companyId,
              name: input.name,
            });
            const version = await repository.createNextVersion({
              workspaceId: actor.workspaceId,
              companyId: input.companyId,
              templateId: template.id,
              definition: input.definition,
              createdByUserId: actor.userId,
            });
            if (
              !(await repository.setActiveVersion(
                actor.workspaceId,
                template.id,
                version.id,
              ))
            )
              throw new Error("new template was not activated");
            const result = {
              template: { ...template, activeVersionId: version.id },
              version,
            };
            await emit(writer, actor, "template.created", template.id);
            return result;
          },
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505" &&
          "constraint" in error &&
          error.constraint === "template_company_name_unique"
        )
          throw new AuthorizationError("conflict");
        throw error;
      }
      return result;
    },

    async createVersion(
      actor: HumanActor,
      templateId: string,
      definition: TemplateDefinition,
      activate: boolean,
    ): Promise<TemplateVersion> {
      const template = await this.get(actor, templateId);
      const version = await deps.repository.transaction(
        async (repository, writer) => {
          await validateDefinition(
            repository,
            actor,
            template.companyId,
            definition,
          );
          const created = await repository.createNextVersion({
            workspaceId: actor.workspaceId,
            companyId: template.companyId,
            templateId,
            definition,
            createdByUserId: actor.userId,
          });
          if (
            activate &&
            !(await repository.setActiveVersion(
              actor.workspaceId,
              templateId,
              created.id,
            ))
          )
            throw new AuthorizationError("not_found");
          await emit(writer, actor, "template.version_created", templateId);
          return created;
        },
      );
      return version;
    },

    async activate(
      actor: HumanActor,
      templateId: string,
      versionId: string,
    ): Promise<void> {
      await this.get(actor, templateId);
      if (
        !(await deps.repository.findVersion(
          actor.workspaceId,
          templateId,
          versionId,
        ))
      )
        throw new AuthorizationError("not_found");
      await deps.repository.transaction(async (repository, writer) => {
        if (
          !(await repository.setActiveVersion(
            actor.workspaceId,
            templateId,
            versionId,
          ))
        )
          throw new AuthorizationError("not_found");
        await emit(writer, actor, "template.activated", templateId);
      });
    },

    async preview(
      actor: HumanActor,
      templateId: string,
      input: Readonly<{
        versionId?: string | undefined;
        definition?: TemplateDefinition | undefined;
        data: TemplateData;
      }>,
    ): Promise<Readonly<{ url: string }>> {
      const template = await this.get(actor, templateId);
      const resolved = input.versionId
        ? await deps.repository.findVersion(
            actor.workspaceId,
            templateId,
            input.versionId,
          )
        : undefined;
      if (input.versionId && !resolved)
        throw new AuthorizationError("not_found");
      const definition = input.definition ?? resolved?.definition;
      if (!definition) throw new AuthorizationError("not_found");
      await validateDefinition(
        deps.repository,
        actor,
        template.companyId,
        definition,
      );
      return deps.renderer.renderPreview({
        workspaceId: actor.workspaceId,
        companyId: template.companyId,
        templateVersionId: resolved?.id ?? "draft",
        definition,
        data: input.data,
      });
    },
  };
}
