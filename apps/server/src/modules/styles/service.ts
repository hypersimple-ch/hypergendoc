import {
  FontFamilySchema,
  type Style,
  type StyleDefinition,
  type StyleVersion,
} from "@hypergendoc/contracts";
import type { AuditWriter } from "../../platform/audit.js";
import { auditActor } from "../../platform/audit.js";
import type { AgentActor, HumanActor } from "../auth/actors.js";
import { AuthorizationError } from "../memberships/service.js";

export interface PreviewRenderer {
  renderPreview(
    input: Readonly<{
      workspaceId: string;
      companyId: string;
      styleVersionId: string;
      definition: StyleDefinition;
    }>,
  ): Promise<Readonly<{ url: string }>>;
}
export interface StyleRepository {
  transaction<T>(
    operation: (repository: StyleOperations) => Promise<T>,
  ): Promise<T>;
  companyExists(workspaceId: string, companyId: string): Promise<boolean>;
  /** Must prove the object is an active logo uploaded for this company in this workspace. */
  logoBelongsToCompany(
    workspaceId: string,
    companyId: string,
    objectId: string,
  ): Promise<boolean>;
  /** Must prove the object is an active uploaded font for this company in this workspace. */
  fontBelongsToCompany(
    workspaceId: string,
    companyId: string,
    objectId: string,
  ): Promise<boolean>;
  materializeAssets(
    workspaceId: string,
    companyId: string,
    assets: Readonly<{
      builtInFonts: readonly string[];
      colors: readonly string[];
    }>,
  ): Promise<void>;
  list(workspaceId: string, companyId: string): Promise<readonly Style[]>;
  find(workspaceId: string, styleId: string): Promise<Style | undefined>;
  listVersions(
    workspaceId: string,
    styleId: string,
  ): Promise<readonly StyleVersion[]>;
  findVersion(
    workspaceId: string,
    styleId: string,
    versionId: string,
  ): Promise<StyleVersion | undefined>;
  createStyle(
    input: Readonly<{ workspaceId: string; companyId: string; name: string }>,
  ): Promise<Style>;
  /** Allocates the next version while holding a database lock for this style. */
  createNextVersion(
    input: Readonly<{
      workspaceId: string;
      styleId: string;
      definition: StyleDefinition;
      createdByUserId: string;
    }>,
  ): Promise<StyleVersion>;
  /** Update only the logical pointer; style_versions are never updated. */
  setActiveVersion(
    workspaceId: string,
    styleId: string,
    versionId: string,
  ): Promise<boolean>;
}
export type StyleOperations = Omit<StyleRepository, "transaction">;

export function createStyleService(deps: {
  repository: StyleRepository;
  audit: AuditWriter;
  renderer: PreviewRenderer;
}) {
  async function validateDefinition(
    repository: StyleOperations,
    actor: HumanActor,
    companyId: string,
    definition: StyleDefinition,
  ) {
    if (
      definition.logoObjectId &&
      !(await repository.logoBelongsToCompany(
        actor.workspaceId,
        companyId,
        definition.logoObjectId,
      ))
    )
      throw new AuthorizationError("not_found");
    const references = [
      definition.bodyFont,
      definition.headingFont,
      ...Object.values(definition.textStyles ?? {}).map(
        (style) => style.fontFamily,
      ),
    ];
    for (const reference of references)
      if (
        !FontFamilySchema.safeParse(reference).success &&
        !(await repository.fontBelongsToCompany(
          actor.workspaceId,
          companyId,
          reference,
        ))
      )
        throw new AuthorizationError("not_found");
  }
  function materializedAssets(definition: StyleDefinition) {
    const fonts = new Set<string>();
    for (const reference of [
      definition.bodyFont,
      definition.headingFont,
      ...Object.values(definition.textStyles ?? {}).map(
        (style) => style.fontFamily,
      ),
    ])
      if (FontFamilySchema.safeParse(reference).success) fonts.add(reference);
    const colors = new Set(
      [
        ...Object.values(definition.colors),
        ...Object.values(definition.textStyles ?? {}).map(
          (style) => style.color,
        ),
      ].map((color) => color.toLowerCase()),
    );
    return { builtInFonts: [...fonts], colors: [...colors] };
  }
  function savedDefinition(definition: StyleDefinition): StyleDefinition {
    return definition.assetVersion === 1
      ? definition
      : { ...definition, assetVersion: 1 };
  }
  const emit = (actor: HumanActor, event: string, styleId: string) =>
    deps.audit.write({
      workspaceId: actor.workspaceId,
      requestId: actor.requestId,
      event,
      ...auditActor({ type: "human", ...actor }),
      targetType: "style",
      targetId: styleId,
      outcome: "success",
    });
  return {
    async list(actor: HumanActor | AgentActor, companyId: string) {
      if (
        !(await deps.repository.companyExists(actor.workspaceId, companyId)) ||
        ("credentialId" in actor &&
          (!actor.actions.includes("styles:read") ||
            !actor.allowedCompanyIds.includes(companyId)))
      )
        throw new AuthorizationError("not_found");
      return deps.repository.list(actor.workspaceId, companyId);
    },
    async get(actor: HumanActor, styleId: string): Promise<Style> {
      const style = await deps.repository.find(actor.workspaceId, styleId);
      if (!style) throw new AuthorizationError("not_found");
      return style;
    },
    async history(actor: HumanActor, styleId: string) {
      await this.get(actor, styleId);
      return deps.repository.listVersions(actor.workspaceId, styleId);
    },
    async create(
      actor: HumanActor,
      input: Readonly<{
        companyId: string;
        name: string;
        definition: StyleDefinition;
      }>,
    ): Promise<{ style: Style; version: StyleVersion }> {
      if (
        !(await deps.repository.companyExists(
          actor.workspaceId,
          input.companyId,
        ))
      )
        throw new AuthorizationError("not_found");
      const definition = savedDefinition(input.definition);
      let result: { style: Style; version: StyleVersion };
      try {
        result = await deps.repository.transaction(async (repository) => {
          await validateDefinition(
            repository,
            actor,
            input.companyId,
            definition,
          );
          await repository.materializeAssets(
            actor.workspaceId,
            input.companyId,
            materializedAssets(definition),
          );
          const style = await repository.createStyle({
            workspaceId: actor.workspaceId,
            companyId: input.companyId,
            name: input.name,
          });
          const version = await repository.createNextVersion({
            workspaceId: actor.workspaceId,
            styleId: style.id,
            definition,
            createdByUserId: actor.userId,
          });
          if (
            !(await repository.setActiveVersion(
              actor.workspaceId,
              style.id,
              version.id,
            ))
          )
            throw new Error("new style was not activated");
          return { style: { ...style, activeVersionId: version.id }, version };
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505" &&
          "constraint" in error &&
          error.constraint === "style_company_name_unique"
        )
          throw new AuthorizationError("conflict");
        throw error;
      }
      await emit(actor, "style.created", result.style.id);
      return result;
    },
    async createVersion(
      actor: HumanActor,
      styleId: string,
      definition: StyleDefinition,
      activate: boolean,
    ): Promise<StyleVersion> {
      const style = await this.get(actor, styleId);
      const saved = savedDefinition(definition);
      const version = await deps.repository.transaction(async (repository) => {
        await validateDefinition(repository, actor, style.companyId, saved);
        await repository.materializeAssets(
          actor.workspaceId,
          style.companyId,
          materializedAssets(saved),
        );
        const created = await repository.createNextVersion({
          workspaceId: actor.workspaceId,
          styleId,
          definition: saved,
          createdByUserId: actor.userId,
        });
        if (
          activate &&
          !(await repository.setActiveVersion(
            actor.workspaceId,
            styleId,
            created.id,
          ))
        )
          throw new AuthorizationError("not_found");
        return created;
      });
      await emit(actor, "style.version_created", styleId);
      return version;
    },
    async activate(
      actor: HumanActor,
      styleId: string,
      versionId: string,
    ): Promise<void> {
      await this.get(actor, styleId);
      if (
        !(await deps.repository.findVersion(
          actor.workspaceId,
          styleId,
          versionId,
        ))
      )
        throw new AuthorizationError("not_found");
      if (
        !(await deps.repository.setActiveVersion(
          actor.workspaceId,
          styleId,
          versionId,
        ))
      )
        throw new AuthorizationError("not_found");
      await emit(actor, "style.activated", styleId);
    },
    async preview(
      actor: HumanActor,
      styleId: string,
      input: Readonly<{
        versionId?: string | undefined;
        definition?: StyleDefinition | undefined;
      }>,
    ) {
      const style = await this.get(actor, styleId);
      const resolved = input.versionId
        ? await deps.repository.findVersion(
            actor.workspaceId,
            styleId,
            input.versionId,
          )
        : undefined;
      if (input.versionId && !resolved)
        throw new AuthorizationError("not_found");
      const definition = input.definition ?? resolved?.definition;
      if (!definition) throw new AuthorizationError("not_found");
      // Draft previews never create a style version or stored object.  They use
      // the same logo ownership validation as persisted definitions.
      await validateDefinition(
        deps.repository,
        actor,
        style.companyId,
        definition,
      );
      return deps.renderer.renderPreview({
        workspaceId: actor.workspaceId,
        companyId: style.companyId,
        styleVersionId: resolved?.id ?? "draft",
        definition,
      });
    },
  };
}
