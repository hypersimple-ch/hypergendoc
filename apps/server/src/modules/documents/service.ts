import {
  CreateDocumentInputSchema,
  CreateTemplateDocumentInputSchema,
  UpdateTemplateDocumentInputSchema,
  RevertDocumentInputSchema,
  UpdateDocumentInputSchema,
  type Document,
  type DocumentCommit,
  type DocumentCurrentSource,
  type DocumentDetail,
  type ResolvedStyleAssets,
  type StyleDefinition,
  type TemplateData,
  type TemplateDefinition,
} from "@hypergendoc/contracts";
import {
  DocumentInputError,
  renderTemplateDocumentHtml,
  templateImageIds,
  sourceHash as resolvedSourceHash,
} from "@hypergendoc/document";
import { auditActor } from "../../platform/audit.js";
import type { ActorContext } from "../../platform/context.js";
import { AppError } from "../../platform/errors.js";
import type {
  GitDocumentCheckpoint,
  GitDocumentRevision,
} from "./git-store.js";
import { toDocumentCommit, toDocumentSnapshot } from "./commit-mappers.js";
import { rendererFailure, type RenderResult } from "./renderer-client.js";
import {
  actorId,
  actorType,
  invalid,
  mapGitError,
  notFound,
  requireAction,
  requireActor,
  sha256,
} from "./service-helpers.js";
import type {
  DocumentServiceDependencies,
  ResolvedDocumentSource,
} from "./service-types.js";

export type {
  DocumentRepository,
  DocumentServiceDependencies,
  DocumentSourceBuilder,
  ResolvedDocumentSource,
  StyleAssetResolver,
  TemplateAssetResolver,
} from "./service-types.js";

type StoredTemplateBody = Readonly<{
  schemaVersion: 1;
  templateVersionId: string;
  data: TemplateData;
}>;

const canonicalTemplateBody = (templateVersionId: string, data: TemplateData) =>
  `${JSON.stringify({ schemaVersion: 1, templateVersionId, data })}
`;

const parseTemplateBody = (body: string): StoredTemplateBody => {
  try {
    const value = JSON.parse(body) as Partial<StoredTemplateBody>;
    if (
      value.schemaVersion !== 1 ||
      typeof value.templateVersionId !== "string" ||
      typeof value.data !== "object" ||
      value.data === null ||
      Array.isArray(value.data)
    )
      throw new Error("invalid template body");
    return value as StoredTemplateBody;
  } catch {
    throw invalid();
  }
};

export class DocumentService {
  public constructor(private readonly deps: DocumentServiceDependencies) {}

  async create(
    actor: ActorContext | undefined,
    raw: unknown,
  ): Promise<{ document: Document; current: DocumentCurrentSource }> {
    requireActor(actor);
    const parsed = CreateDocumentInputSchema.safeParse(raw);
    if (!parsed.success) throw invalid();
    requireAction(actor, "documents:write", parsed.data.companyId);

    let checkpoint: GitDocumentCheckpoint | undefined;
    let mutationCommitId: string | undefined;
    let document!: Document;
    try {
      document = await this.deps.repository.transaction(async (repository) => {
        if (
          !(await repository.companyExists(
            actor.workspaceId,
            parsed.data.companyId,
          ))
        )
          throw notFound();
        const style = await repository.findActiveStyle(
          actor.workspaceId,
          parsed.data.companyId,
          parsed.data.styleId,
        );
        if (!style?.activeVersionId) throw notFound();
        await repository.lockCompanyForGitWrites(
          actor.workspaceId,
          parsed.data.companyId,
        );
        checkpoint = await this.deps.git.checkpoint(
          actor.workspaceId,
          parsed.data.companyId,
        );
        const created = await repository.insertDocument({
          workspaceId: actor.workspaceId,
          companyId: parsed.data.companyId,
          title: parsed.data.title,
          metadata: parsed.data.metadata ?? {},
        });
        const source = this.resolveSource(
          parsed.data.format,
          parsed.data.body,
          style.definition,
          await this.resolveStyleAssets(
            actor.workspaceId,
            parsed.data.companyId,
            style.definition,
          ),
        );
        mutationCommitId = await this.writeGit(actor, created, {
          format: parsed.data.format,
          body: source.body,
          styleVersionId: style.activeVersionId,
        });
        return created;
      });
      if (checkpoint) this.deps.git.completeCheckpoint(checkpoint);
    } catch (error) {
      await this.compensateGit(checkpoint, mutationCommitId, error);
    }
    const current = await this.currentSource(actor.workspaceId, document);
    await this.audit(actor, "document.create", document.id, "success");
    return { document, current };
  }

  async createFromTemplate(
    actor: ActorContext | undefined,
    raw: unknown,
  ): Promise<{ document: Document; current: DocumentCurrentSource }> {
    requireActor(actor);
    const parsed = CreateTemplateDocumentInputSchema.safeParse(raw);
    if (!parsed.success) throw invalid();
    requireAction(actor, "documents:write", parsed.data.companyId);

    let checkpoint: GitDocumentCheckpoint | undefined;
    let mutationCommitId: string | undefined;
    let document!: Document;
    try {
      document = await this.deps.repository.transaction(async (repository) => {
        if (
          !(await repository.companyExists(
            actor.workspaceId,
            parsed.data.companyId,
          ))
        )
          throw notFound();
        const template = await repository.findActiveTemplate(
          actor.workspaceId,
          parsed.data.companyId,
          parsed.data.templateId,
        );
        if (!template) throw notFound();
        const resolved = await this.resolveTemplate(
          actor.workspaceId,
          parsed.data.companyId,
          template.definition,
          parsed.data.data,
        );
        await repository.lockCompanyForGitWrites(
          actor.workspaceId,
          parsed.data.companyId,
        );
        checkpoint = await this.deps.git.checkpoint(
          actor.workspaceId,
          parsed.data.companyId,
        );
        const created = await repository.insertDocument({
          workspaceId: actor.workspaceId,
          companyId: parsed.data.companyId,
          templateId: template.templateId,
          title: parsed.data.title,
          metadata: parsed.data.metadata ?? {},
        });
        const body = canonicalTemplateBody(
          template.versionId,
          parsed.data.data,
        );
        mutationCommitId = await this.writeTemplateGit(actor, created, {
          body,
          styleVersionId: template.definition.styleVersionId,
          templateVersionId: template.versionId,
        });
        if (!resolved.source) throw new Error("invalid source");
        return created;
      });
      if (checkpoint) this.deps.git.completeCheckpoint(checkpoint);
    } catch (error) {
      await this.compensateGit(checkpoint, mutationCommitId, error);
    }
    const current = await this.currentSource(actor.workspaceId, document);
    await this.audit(
      actor,
      "document.create_from_template",
      document.id,
      "success",
    );
    return { document, current };
  }

  async updateFromTemplate(
    actor: ActorContext | undefined,
    documentId: string,
    raw: unknown,
  ): Promise<DocumentCurrentSource> {
    requireActor(actor);
    const parsed = UpdateTemplateDocumentInputSchema.safeParse(raw);
    if (!parsed.success) throw invalid();
    let checkpoint: GitDocumentCheckpoint | undefined;
    let mutationCommitId: string | undefined;
    let document!: Document;
    try {
      document = await this.deps.repository.transaction(async (repository) => {
        const locked = await repository.lockDocument(
          actor.workspaceId,
          documentId,
        );
        if (!locked?.templateId) throw notFound();
        requireAction(actor, "documents:write", locked.companyId);
        const previous = await this.readCurrentRevision(
          actor.workspaceId,
          locked,
        );
        if (previous.format !== "template" || !previous.templateVersionId)
          throw notFound();
        const template = await repository.findTemplateVersion(
          actor.workspaceId,
          locked.companyId,
          parsed.data.templateVersionId ?? previous.templateVersionId,
        );
        if (!template || template.templateId !== locked.templateId)
          throw notFound();
        await this.resolveTemplate(
          actor.workspaceId,
          locked.companyId,
          template.definition,
          parsed.data.data,
        );
        await repository.lockCompanyForGitWrites(
          actor.workspaceId,
          locked.companyId,
        );
        checkpoint = await this.deps.git.checkpoint(
          actor.workspaceId,
          locked.companyId,
        );
        const touched =
          (await repository.touchDocument(actor.workspaceId, documentId)) ??
          locked;
        mutationCommitId = await this.writeTemplateGit(actor, locked, {
          body: canonicalTemplateBody(template.versionId, parsed.data.data),
          styleVersionId: template.definition.styleVersionId,
          templateVersionId: template.versionId,
        });
        return touched;
      });
      if (checkpoint) this.deps.git.completeCheckpoint(checkpoint);
    } catch (error) {
      await this.compensateGit(checkpoint, mutationCommitId, error);
    }
    const current = await this.currentSource(actor.workspaceId, document);
    await this.audit(
      actor,
      "document.update_from_template",
      document.id,
      "success",
    );
    return current;
  }

  async update(
    actor: ActorContext | undefined,
    documentId: string,
    raw: unknown,
  ): Promise<DocumentCurrentSource> {
    requireActor(actor);
    const parsed = UpdateDocumentInputSchema.safeParse(raw);
    if (!parsed.success) throw invalid();

    let checkpoint: GitDocumentCheckpoint | undefined;
    let mutationCommitId: string | undefined;
    let document!: Document;
    try {
      document = await this.deps.repository.transaction(async (repository) => {
        const locked = await repository.lockDocument(
          actor.workspaceId,
          documentId,
        );
        if (!locked) throw notFound();
        requireAction(actor, "documents:write", locked.companyId);
        await repository.lockCompanyForGitWrites(
          actor.workspaceId,
          locked.companyId,
        );
        const previous = await this.readCurrentRevision(
          actor.workspaceId,
          locked,
        );
        const style = parsed.data.styleVersionId
          ? await repository.findActiveStyleVersion(
              actor.workspaceId,
              locked.companyId,
              parsed.data.styleVersionId,
            )
          : await repository.findStyleVersion(
              actor.workspaceId,
              locked.companyId,
              previous.styleVersionId,
            );
        if (!style) throw notFound();
        const source = this.resolveSource(
          parsed.data.format,
          parsed.data.body,
          style.definition,
          await this.resolveStyleAssets(
            actor.workspaceId,
            locked.companyId,
            style.definition,
          ),
        );
        checkpoint = await this.deps.git.checkpoint(
          actor.workspaceId,
          locked.companyId,
        );
        const touched =
          (await repository.touchDocument(actor.workspaceId, documentId)) ??
          locked;
        mutationCommitId = await this.writeGit(actor, locked, {
          format: parsed.data.format,
          body: source.body,
          styleVersionId: style.id,
        });
        return touched;
      });
      if (checkpoint) this.deps.git.completeCheckpoint(checkpoint);
    } catch (error) {
      await this.compensateGit(checkpoint, mutationCommitId, error);
    }
    const current = await this.currentSource(actor.workspaceId, document);
    await this.audit(actor, "document.update", document.id, "success");
    return current;
  }

  async list(
    actor: ActorContext | undefined,
    companyId?: string,
  ): Promise<Document[]> {
    requireActor(actor);
    if (companyId) requireAction(actor, "documents:read", companyId);
    const documents = await this.deps.repository.listDocuments(
      actor.workspaceId,
      companyId,
    );
    return actor.type === "agent"
      ? documents.filter((document) =>
          actor.allowedCompanyIds.includes(document.companyId),
        )
      : documents;
  }

  async get(
    actor: ActorContext | undefined,
    documentId: string,
  ): Promise<Document> {
    requireActor(actor);
    const document = await this.deps.repository.findDocument(
      actor.workspaceId,
      documentId,
    );
    if (!document) throw notFound();
    requireAction(actor, "documents:read", document.companyId);
    return document;
  }

  async history(
    actor: ActorContext | undefined,
    documentId: string,
  ): Promise<DocumentCommit[]> {
    const document = await this.get(actor, documentId);
    return this.documentHistory(actor!.workspaceId, document);
  }

  async detail(
    actor: ActorContext | undefined,
    documentId: string,
  ): Promise<DocumentDetail> {
    const document = await this.get(actor, documentId);
    const commits = await this.documentHistory(actor!.workspaceId, document);
    if (!commits[0]) throw notFound();
    const revision = await this.readRevision(
      actor!.workspaceId,
      document,
      commits[0].commitSha,
    );
    return {
      document,
      current: {
        commit: commits[0],
        snapshot: toDocumentSnapshot(document.id, revision),
      },
      commits,
    };
  }

  async readCommit(
    actor: ActorContext | undefined,
    documentId: string,
    commitSha: string,
  ): Promise<DocumentCurrentSource> {
    const document = await this.get(actor, documentId);
    const commits = await this.documentHistory(actor!.workspaceId, document);
    const commit = commits.find((entry) => entry.commitSha === commitSha);
    if (!commit) throw notFound();
    const revision = await this.readRevision(
      actor!.workspaceId,
      document,
      commitSha,
    );
    await this.audit(actor!, "document.commit.access", documentId, "success");
    return {
      commit,
      snapshot: toDocumentSnapshot(document.id, revision),
    };
  }

  async revert(
    actor: ActorContext | undefined,
    documentId: string,
    raw: unknown,
  ): Promise<DocumentCurrentSource> {
    requireActor(actor);
    const parsed = RevertDocumentInputSchema.safeParse(raw);
    if (!parsed.success) throw invalid();
    let checkpoint: GitDocumentCheckpoint | undefined;
    let mutationCommitId: string | undefined;
    let document!: Document;
    try {
      document = await this.deps.repository.transaction(async (repository) => {
        const locked = await repository.lockDocument(
          actor.workspaceId,
          documentId,
        );
        if (!locked) throw notFound();
        requireAction(actor, "documents:write", locked.companyId);
        await repository.lockCompanyForGitWrites(
          actor.workspaceId,
          locked.companyId,
        );
        const historical = await this.readRevision(
          actor.workspaceId,
          locked,
          parsed.data.commitSha,
        );
        if (
          !(await repository.findStyleVersion(
            actor.workspaceId,
            locked.companyId,
            historical.styleVersionId,
          ))
        )
          throw notFound();
        if (historical.format === "template") {
          if (!historical.templateVersionId || !locked.templateId)
            throw notFound();
          const template = await repository.findTemplateVersion(
            actor.workspaceId,
            locked.companyId,
            historical.templateVersionId,
          );
          if (!template || template.templateId !== locked.templateId)
            throw notFound();
        }
        checkpoint = await this.deps.git.checkpoint(
          actor.workspaceId,
          locked.companyId,
        );
        const touched =
          (await repository.touchDocument(actor.workspaceId, documentId)) ??
          locked;
        try {
          const revision = await this.deps.git.revert({
            workspaceId: actor.workspaceId,
            companyId: locked.companyId,
            documentId: locked.id,
            commitId: parsed.data.commitSha,
            actor: { type: actorType(actor), id: actorId(actor) },
          });
          mutationCommitId = revision.commitId;
        } catch (error) {
          mapGitError(error);
        }
        return touched;
      });
      if (checkpoint) this.deps.git.completeCheckpoint(checkpoint);
    } catch (error) {
      await this.compensateGit(checkpoint, mutationCommitId, error);
    }
    const current = await this.currentSource(actor.workspaceId, document);
    await this.audit(actor, "document.revert", document.id, "success");
    return current;
  }

  async pdf(
    actor: ActorContext | undefined,
    documentId: string,
  ): Promise<
    Readonly<{ bytes: Uint8Array; contentType: string; commitSha: string }>
  > {
    const document = await this.get(actor, documentId);
    const current = await this.currentSource(actor!.workspaceId, document);
    let source: ResolvedDocumentSource;
    let result: RenderResult;
    try {
      if (current.snapshot.format === "template") {
        const stored = parseTemplateBody(current.snapshot.body);
        if (
          !current.snapshot.templateVersionId ||
          stored.templateVersionId !== current.snapshot.templateVersionId
        )
          throw notFound();
        const template = await this.deps.repository.findTemplateVersion(
          actor!.workspaceId,
          document.companyId,
          stored.templateVersionId,
        );
        if (!template || template.templateId !== document.templateId)
          throw notFound();
        const resolved = await this.resolveTemplate(
          actor!.workspaceId,
          document.companyId,
          template.definition,
          stored.data,
        );
        source = { body: current.snapshot.body, source: resolved.source };
        result = await this.deps.renderer.render({
          format: "template",
          template: template.definition,
          data: stored.data,
          style: resolved.style,
          assets: resolved.assets,
          templateAssets: resolved.templateAssets,
        });
      } else {
        const style = await this.deps.repository.findStyleVersion(
          actor!.workspaceId,
          document.companyId,
          current.snapshot.styleVersionId,
        );
        if (!style) throw notFound();
        const assets = await this.resolveStyleAssets(
          actor!.workspaceId,
          document.companyId,
          style.definition,
        );
        source = this.resolveSource(
          current.snapshot.format,
          current.snapshot.body,
          style.definition,
          assets,
        );
        result = await this.deps.renderer.render({
          format: current.snapshot.format,
          body: source.body,
          style: style.definition,
          assets,
        });
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("dependency_unavailable", 503);
    }
    if (!result.ok || !result.pdf) throw rendererFailure(result);
    if (
      result.sourceHash !== resolvedSourceHash(source.source) ||
      result.pdfHash !== sha256(result.pdf)
    )
      throw new AppError("render_failed", 422);
    await this.audit(actor!, "document.pdf.access", document.id, "success");
    return {
      bytes: result.pdf,
      contentType: "application/pdf",
      commitSha: current.snapshot.commitSha,
    };
  }

  private async documentHistory(
    workspaceId: string,
    document: Document,
  ): Promise<DocumentCommit[]> {
    try {
      return (
        await this.deps.git.history({
          workspaceId,
          companyId: document.companyId,
          documentId: document.id,
        })
      ).map((entry) => toDocumentCommit(document.id, entry));
    } catch (error) {
      mapGitError(error);
    }
  }

  private async currentSource(
    workspaceId: string,
    document: Document,
  ): Promise<DocumentCurrentSource> {
    const commits = await this.documentHistory(workspaceId, document);
    const commit = commits[0];
    if (!commit) throw notFound();
    const revision = await this.readRevision(
      workspaceId,
      document,
      commit.commitSha,
    );
    return {
      commit,
      snapshot: toDocumentSnapshot(document.id, revision),
    };
  }

  private async readCurrentRevision(
    workspaceId: string,
    document: Document,
  ): Promise<GitDocumentRevision> {
    try {
      return await this.deps.git.readCurrent({
        workspaceId,
        companyId: document.companyId,
        documentId: document.id,
      });
    } catch (error) {
      mapGitError(error);
    }
  }

  private async readRevision(
    workspaceId: string,
    document: Document,
    commitId: string,
  ): Promise<GitDocumentRevision> {
    try {
      return await this.deps.git.readHistorical({
        workspaceId,
        companyId: document.companyId,
        documentId: document.id,
        commitId,
      });
    } catch (error) {
      mapGitError(error);
    }
  }

  private async writeGit(
    actor: ActorContext,
    document: Document,
    input: Readonly<{
      format: "markdown" | "html";
      body: string;
      styleVersionId: string;
    }>,
  ): Promise<string> {
    try {
      const revision = await this.deps.git.write({
        workspaceId: actor.workspaceId,
        companyId: document.companyId,
        documentId: document.id,
        ...input,
        actor: { type: actorType(actor), id: actorId(actor) },
      });
      return revision.commitId;
    } catch (error) {
      mapGitError(error);
    }
  }

  private async resolveTemplate(
    workspaceId: string,
    companyId: string,
    definition: TemplateDefinition,
    data: TemplateData,
  ) {
    const style = await this.deps.repository.findStyleVersion(
      workspaceId,
      companyId,
      definition.styleVersionId,
    );
    if (!style) throw notFound();
    const [assets, templateAssets] = await Promise.all([
      this.resolveStyleAssets(workspaceId, companyId, style.definition),
      this.deps.templateAssetResolver?.resolve(
        workspaceId,
        companyId,
        templateImageIds(definition, data),
      ) ?? Promise.resolve({ images: [] }),
    ]);
    try {
      return {
        style: style.definition,
        assets,
        templateAssets,
        source: renderTemplateDocumentHtml({
          definition,
          data,
          style: style.definition,
          styleAssets: assets,
          templateAssets,
        }),
      };
    } catch (error) {
      if (error instanceof DocumentInputError) throw invalid();
      if (error instanceof AppError) throw error;
      throw new AppError("render_rejected", 422);
    }
  }

  private async writeTemplateGit(
    actor: ActorContext,
    document: Document,
    input: Readonly<{
      body: string;
      styleVersionId: string;
      templateVersionId: string;
    }>,
  ): Promise<string> {
    try {
      const revision = await this.deps.git.write({
        workspaceId: actor.workspaceId,
        companyId: document.companyId,
        documentId: document.id,
        format: "template",
        ...input,
        actor: { type: actorType(actor), id: actorId(actor) },
      });
      return revision.commitId;
    } catch (error) {
      mapGitError(error);
    }
  }

  private async resolveStyleAssets(
    workspaceId: string,
    companyId: string,
    style: StyleDefinition,
  ) {
    return (
      this.deps.styleAssetResolver?.resolve(workspaceId, companyId, style) ??
      Promise.resolve({ logo: null, fonts: [] })
    );
  }

  private resolveSource(
    format: "markdown" | "html",
    body: string,
    style: StyleDefinition,
    assets: ResolvedStyleAssets,
  ): ResolvedDocumentSource {
    try {
      const source = this.deps.sourceBuilder.resolve(
        format,
        body,
        style,
        assets,
      );
      if (!source.body || !source.source) throw new Error("invalid source");
      return source;
    } catch (error) {
      if (error instanceof DocumentInputError) throw invalid();
      if (error instanceof AppError) throw error;
      throw new AppError("render_rejected", 422);
    }
  }

  private async compensateGit(
    checkpoint: GitDocumentCheckpoint | undefined,
    expectedHeadCommitId: string | undefined,
    cause: unknown,
  ): Promise<never> {
    if (checkpoint) {
      try {
        await this.deps.git.restoreCheckpoint(checkpoint, expectedHeadCommitId);
      } catch {
        throw new AppError("dependency_unavailable", 503);
      }
    }
    throw cause;
  }

  private async audit(
    actor: ActorContext,
    event: string,
    targetId: string,
    outcome: "success" | "failure",
  ): Promise<void> {
    await this.deps.audit?.write({
      workspaceId: actor.workspaceId,
      requestId: actor.requestId,
      event,
      ...auditActor(actor),
      targetType: "document",
      targetId,
      outcome,
    });
  }
}

export function createDocumentService(
  deps: DocumentServiceDependencies,
): DocumentService {
  return new DocumentService(deps);
}
