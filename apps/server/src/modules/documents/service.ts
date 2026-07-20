import { createHash } from "node:crypto";
import {
  CreateDocumentInputSchema,
  RevertDocumentInputSchema,
  UpdateDocumentInputSchema,
  type Document,
  type DocumentCommit,
  type DocumentCurrentSource,
  type DocumentDetail,
  type StyleDefinition,
} from "@hypergendoc/contracts";
import {
  DocumentInputError,
  sourceHash as resolvedSourceHash,
} from "@hypergendoc/document";
import { auditActor } from "../../platform/audit.js";
import type { ActorContext } from "../../platform/context.js";
import { AppError } from "../../platform/errors.js";
import {
  GitDocumentNotFoundError,
  GitDocumentStoreValidationError,
  type GitDocumentRevision,
} from "./git-store.js";
import { toDocumentCommit, toDocumentSnapshot } from "./commit-mappers.js";
import { rendererFailure, type RenderResult } from "./renderer-client.js";
import type {
  DocumentServiceDependencies,
  ResolvedDocumentSource,
} from "./service-types.js";

export type {
  DocumentRepository,
  DocumentServiceDependencies,
  DocumentSourceBuilder,
  ResolvedDocumentSource,
} from "./service-types.js";

const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const actorId = (actor: ActorContext) =>
  actor.type === "human" ? actor.userId : actor.credentialId;
const actorType = (actor: ActorContext) =>
  actor.type === "human" ? ("user" as const) : ("credential" as const);

function requireActor(
  actor: ActorContext | undefined,
): asserts actor is ActorContext {
  if (!actor) throw new AppError("unauthenticated", 401);
}

function requireAction(
  actor: ActorContext,
  action: "documents:read" | "documents:write",
  companyId: string,
): void {
  if (
    actor.type === "agent" &&
    (!actor.actions.includes(action) ||
      !actor.allowedCompanyIds.includes(companyId))
  )
    throw new AppError("not_found", 404);
}

const invalid = () => new AppError("validation_failed", 400);
const notFound = () => new AppError("not_found", 404);

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

    const document = await this.deps.repository.transaction(
      async (repository) => {
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
        this.resolveSource(
          parsed.data.format,
          parsed.data.body,
          style.definition,
        );
        await repository.lockCompanyForGitWrites(
          actor.workspaceId,
          parsed.data.companyId,
        );
        const created = await repository.insertDocument({
          workspaceId: actor.workspaceId,
          companyId: parsed.data.companyId,
          title: parsed.data.title,
        });
        await this.writeGit(actor, created, {
          format: parsed.data.format,
          body: parsed.data.body,
          styleVersionId: style.activeVersionId,
        });
        return created;
      },
    );
    const current = await this.currentSource(actor.workspaceId, document);
    await this.audit(actor, "document.create", document.id, "success");
    return { document, current };
  }

  async update(
    actor: ActorContext | undefined,
    documentId: string,
    raw: unknown,
  ): Promise<DocumentCurrentSource> {
    requireActor(actor);
    const parsed = UpdateDocumentInputSchema.safeParse(raw);
    if (!parsed.success) throw invalid();

    const document = await this.deps.repository.transaction(
      async (repository) => {
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
        this.resolveSource(
          parsed.data.format,
          parsed.data.body,
          style.definition,
        );
        const touched =
          (await repository.touchDocument(actor.workspaceId, documentId)) ??
          locked;
        await this.writeGit(actor, locked, {
          format: parsed.data.format,
          body: parsed.data.body,
          styleVersionId: style.id,
        });
        return touched;
      },
    );
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
    const document = await this.deps.repository.transaction(
      async (repository) => {
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
        const touched =
          (await repository.touchDocument(actor.workspaceId, documentId)) ??
          locked;
        try {
          await this.deps.git.revert({
            workspaceId: actor.workspaceId,
            companyId: locked.companyId,
            documentId: locked.id,
            commitId: parsed.data.commitSha,
            actor: { type: actorType(actor), id: actorId(actor) },
          });
        } catch (error) {
          this.mapGitError(error);
        }
        return touched;
      },
    );
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
    const style = await this.deps.repository.findStyleVersion(
      actor!.workspaceId,
      document.companyId,
      current.snapshot.styleVersionId,
    );
    if (!style) throw notFound();
    const source = this.resolveSource(
      current.snapshot.format,
      current.snapshot.body,
      style.definition,
    );
    let result: RenderResult;
    try {
      result = await this.deps.renderer.render({
        format: current.snapshot.format,
        body: source.body,
        style: style.definition,
      });
    } catch {
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
      this.mapGitError(error);
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
      this.mapGitError(error);
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
      this.mapGitError(error);
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
  ): Promise<void> {
    try {
      await this.deps.git.write({
        workspaceId: actor.workspaceId,
        companyId: document.companyId,
        documentId: document.id,
        ...input,
        actor: { type: actorType(actor), id: actorId(actor) },
      });
    } catch (error) {
      this.mapGitError(error);
    }
  }

  private resolveSource(
    format: "markdown" | "html",
    body: string,
    style: StyleDefinition,
  ): ResolvedDocumentSource {
    try {
      const source = this.deps.sourceBuilder.resolve(format, body, style);
      if (source.body !== body || !source.source)
        throw new Error("invalid source");
      return source;
    } catch (error) {
      if (error instanceof DocumentInputError) throw invalid();
      if (error instanceof AppError) throw error;
      throw new AppError("render_rejected", 422);
    }
  }

  private mapGitError(error: unknown): never {
    if (error instanceof GitDocumentStoreValidationError) throw invalid();
    if (error instanceof GitDocumentNotFoundError) throw notFound();
    throw new AppError("internal_error", 500);
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
