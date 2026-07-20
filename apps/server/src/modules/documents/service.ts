import { createHash } from "node:crypto";
import {
  CreateDocumentInputSchema,
  CreateDocumentVersionInputSchema,
  type CreateDocumentInput,
  type Document,
  type DocumentVersion,
  type StyleDefinition,
} from "@hypergendoc/contracts";
import {
  DocumentInputError,
  inputHash as documentInputHash,
  sourceHash as resolvedSourceHash,
} from "@hypergendoc/document";
import type { ActorContext } from "../../platform/context.js";
import { auditActor } from "../../platform/audit.js";
import { AppError } from "../../platform/errors.js";
import type { StoredObject } from "../../platform/object-store.js";
import type {
  DocumentServiceDependencies,
  DocumentVersionRow,
  ResolvedDocumentSource,
} from "./service-types.js";
import type { RenderResult } from "./renderer-client.js";

export type {
  DocumentRepository,
  DocumentServiceDependencies,
  DocumentSourceBuilder,
  DocumentVersionRow,
  ResolvedDocumentSource,
  StoredObjectRow,
} from "./service-types.js";

const hash = (value: string | Uint8Array) =>
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
function invalid(): AppError {
  return new AppError("validation_failed", 400);
}
function safeDiagnostic(result: RenderResult | undefined): string {
  return result?.error === "render_rejected"
    ? "render_rejected"
    : result?.error === "dependency_unavailable"
      ? "dependency_unavailable"
      : "render_failed";
}

export class DocumentService {
  public constructor(private readonly deps: DocumentServiceDependencies) {}

  async create(
    actor: ActorContext | undefined,
    raw: unknown,
  ): Promise<{ document: Document; version: DocumentVersion }> {
    requireActor(actor);
    const parsed = CreateDocumentInputSchema.safeParse(raw);
    if (!parsed.success) throw invalid();
    requireAction(actor, "documents:write", parsed.data.companyId);
    const pending = await this.createPending(actor, parsed.data);
    const version = await this.renderAndStore(
      actor,
      pending.document,
      pending.version,
      pending.style,
      pending.source,
    );
    await this.audit(
      actor,
      "document.create",
      pending.document.id,
      version.status === "ready" ? "success" : "failure",
    );
    return { document: pending.document, version };
  }

  async createVersion(
    actor: ActorContext | undefined,
    documentId: string,
    raw: unknown,
  ): Promise<DocumentVersion> {
    requireActor(actor);
    const parsed = CreateDocumentVersionInputSchema.safeParse(raw);
    if (!parsed.success) throw invalid();
    const pending = await this.deps.repository.transaction(
      async (repository) => {
        const document = await repository.lockDocument(
          actor.workspaceId,
          documentId,
        );
        if (!document || document.currentVersionId === undefined)
          throw new AppError("not_found", 404);
        requireAction(actor, "documents:write", document.companyId);
        const previous = await repository.findLatestVersion(
          actor.workspaceId,
          documentId,
        );
        if (!previous) throw new AppError("not_found", 404);
        const selected = parsed.data.styleVersionId
          ? await repository.findActiveStyleVersion(
              actor.workspaceId,
              document.companyId,
              parsed.data.styleVersionId,
            )
          : await repository.findStyleVersion(
              actor.workspaceId,
              document.companyId,
              previous.styleVersionId,
            );
        if (!selected) throw new AppError("not_found", 404);
        const source = this.resolveSource(
          parsed.data.format,
          parsed.data.body,
          selected.definition,
        );
        const version = await repository.insertVersion({
          workspaceId: actor.workspaceId,
          documentId,
          version: previous.version + 1,
          styleVersionId: selected.id,
          format: parsed.data.format,
          body: source.body,
          inputHash: documentInputHash(parsed.data.format, source.body),
          createdByType: actorType(actor),
          createdById: actorId(actor),
        });
        await repository.insertRenderRecord({
          workspaceId: actor.workspaceId,
          documentVersionId: version.id,
          inputHash: version.inputHash,
        });
        return { document, version, style: selected.definition, source };
      },
    );
    const version = await this.renderAndStore(
      actor,
      pending.document,
      pending.version,
      pending.style,
      pending.source,
    );
    await this.audit(
      actor,
      "document.version.create",
      version.id,
      version.status === "ready" ? "success" : "failure",
    );
    return version;
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
    if (!document) throw new AppError("not_found", 404);
    requireAction(actor, "documents:read", document.companyId);
    return document;
  }
  async history(
    actor: ActorContext | undefined,
    documentId: string,
  ): Promise<DocumentVersion[]> {
    const document = await this.get(actor, documentId);
    return this.deps.repository.listVersions(actor!.workspaceId, document.id);
  }
  async detail(
    actor: ActorContext | undefined,
    documentId: string,
  ): Promise<{ document: Document; versions: DocumentVersion[] }> {
    const document = await this.get(actor, documentId);
    return { document, versions: await this.history(actor, documentId) };
  }
  async getVersion(
    actor: ActorContext | undefined,
    documentId: string,
    version: number,
  ): Promise<DocumentVersion> {
    const document = await this.get(actor, documentId);
    const result = await this.deps.repository.findVersion(
      actor!.workspaceId,
      document.id,
      version,
    );
    if (!result) throw new AppError("not_found", 404);
    return result;
  }
  async artifact(
    actor: ActorContext | undefined,
    documentId: string,
    version: number,
    kind: "pdf",
  ): Promise<Readonly<{ bytes: Uint8Array; contentType: string }>> {
    const document = await this.get(actor, documentId);
    const artifact = await this.deps.repository.findArtifact(
      actor!.workspaceId,
      document.id,
      version,
      kind,
    );
    if (!artifact || artifact.companyId !== document.companyId)
      throw new AppError("not_found", 404);
    const object = await this.deps.objects.authorizedGet({
      key: artifact.objectKey,
      authorize: () => Promise.resolve(true),
    });
    await this.audit(actor!, `document.${kind}.access`, documentId, "success");
    return { bytes: object.bytes, contentType: "application/pdf" };
  }

  async input(
    actor: ActorContext | undefined,
    documentId: string,
    version: number,
  ): Promise<
    Readonly<{ body: string; format: DocumentVersion["format"]; title: string }>
  > {
    const document = await this.get(actor, documentId);
    const result = await this.deps.repository.findVersion(
      actor!.workspaceId,
      document.id,
      version,
    );
    if (!result) throw new AppError("not_found", 404);
    await this.audit(actor!, "document.input.access", documentId, "success");
    return { body: result.body, format: result.format, title: document.title };
  }

  private async createPending(actor: ActorContext, input: CreateDocumentInput) {
    return this.deps.repository.transaction(async (repository) => {
      if (!(await repository.companyExists(actor.workspaceId, input.companyId)))
        throw new AppError("not_found", 404);
      const style = await repository.findActiveStyle(
        actor.workspaceId,
        input.companyId,
        input.styleId,
      );
      if (!style?.activeVersionId) throw new AppError("not_found", 404);
      const source = this.resolveSource(
        input.format,
        input.body,
        style.definition,
      );
      const document = await repository.insertDocument({
        workspaceId: actor.workspaceId,
        companyId: input.companyId,
        title: input.title,
      });
      const version = await repository.insertVersion({
        workspaceId: actor.workspaceId,
        documentId: document.id,
        version: 1,
        styleVersionId: style.activeVersionId,
        format: input.format,
        body: source.body,
        inputHash: documentInputHash(input.format, source.body),
        createdByType: actorType(actor),
        createdById: actorId(actor),
      });
      await repository.insertRenderRecord({
        workspaceId: actor.workspaceId,
        documentVersionId: version.id,
        inputHash: version.inputHash,
      });
      return { document, version, style: style.definition, source };
    });
  }

  private resolveSource(
    format: DocumentVersion["format"],
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

  private async renderAndStore(
    actor: ActorContext,
    document: Document,
    version: DocumentVersionRow,
    style: StyleDefinition,
    source: ResolvedDocumentSource,
  ): Promise<DocumentVersion> {
    let sourceObject: StoredObject | undefined;
    let pdfObject: StoredObject | undefined;
    let result: RenderResult | undefined;
    const sourceHash = resolvedSourceHash(source.source);
    try {
      result = await this.deps.renderer.render({
        format: version.format,
        body: source.body,
        style,
      });
      if (
        !result.ok ||
        !result.pdf ||
        result.sourceHash !== sourceHash ||
        result.pdfHash !== hash(result.pdf)
      )
        throw new Error(safeDiagnostic(result));
      sourceObject = await this.deps.objects.putPrivate({
        bytes: Buffer.from(source.source),
        contentType: "text/html; charset=utf-8",
        metadata: { "document-version": version.id },
      });
      if (sourceObject.sha256 !== sourceHash) throw new Error("render_failed");
      pdfObject = await this.deps.objects.putPrivate({
        bytes: result.pdf,
        contentType: "application/pdf",
        metadata: { "document-version": version.id },
      });
      if (pdfObject.sha256 !== result.pdfHash) throw new Error("render_failed");
      const ready = await this.deps.repository.transaction(
        async (repository) => {
          const sourceRow = await repository.insertStoredObject({
            workspaceId: actor.workspaceId,
            companyId: document.companyId,
            purpose: "source",
            object: sourceObject!,
          });
          const pdfRow = await repository.insertStoredObject({
            workspaceId: actor.workspaceId,
            companyId: document.companyId,
            purpose: "pdf",
            object: pdfObject!,
          });
          await repository.markReadyAndAdvanceCurrent({
            workspaceId: actor.workspaceId,
            documentId: document.id,
            documentVersionId: version.id,
            sourceObjectId: sourceRow.id,
            pdfObjectId: pdfRow.id,
            sourceHash,
            outputHash: result!.pdfHash!,
            rendererVersion: result!.rendererVersion,
          });
          return repository.findVersion(
            actor.workspaceId,
            document.id,
            version.version,
          );
        },
      );
      if (!ready) throw new Error("render_failed");
      return ready;
    } catch {
      // Object deletion is deliberately best-effort and idempotent; no failed version references artifacts.
      await Promise.allSettled(
        [
          sourceObject && this.deps.objects.delete(sourceObject.key),
          pdfObject && this.deps.objects.delete(pdfObject.key),
        ].filter(Boolean) as Promise<void>[],
      );
      await this.deps.repository.transaction((repository) =>
        repository.markFailed({
          workspaceId: actor.workspaceId,
          documentVersionId: version.id,
          rendererVersion: result?.rendererVersion ?? "unavailable",
          safeDiagnostic: safeDiagnostic(result),
        }),
      );
      const failed = await this.deps.repository.findVersion(
        actor.workspaceId,
        document.id,
        version.version,
      );
      if (!failed) throw new AppError("internal_error", 500);
      return failed;
    }
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
