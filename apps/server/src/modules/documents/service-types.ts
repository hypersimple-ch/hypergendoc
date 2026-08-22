import type {
  Document,
  DocumentFormat,
  ResolvedStyleAssets,
  ResolvedTemplateAssets,
  StyleDefinition,
  TemplateDefinition,
} from "@hypergendoc/contracts";
import type { AuditWriter } from "../../platform/audit.js";
import type { MutationOperationJournal } from "../../platform/mutation-operations.js";
import type { CompanyDocumentGitStore } from "./git-store.js";
import type { Renderer } from "./renderer-client.js";

export interface ResolvedDocumentSource {
  /** Validated source; HTML is canonicalized by the sanitizer. */
  readonly body: string;
  /** Complete server-owned resolved HTML, never persisted. */
  readonly source: string;
}

/** Source validation and generated HTML must use the same pinned style wrapper. */
export interface DocumentSourceBuilder {
  resolve(
    format: DocumentFormat,
    body: string,
    style: StyleDefinition,
    assets?: ResolvedStyleAssets,
  ): ResolvedDocumentSource;
}

/** Resolves authorized immutable style bytes for canonical document rendering. */
export interface StyleAssetResolver {
  resolve(
    workspaceId: string,
    companyId: string,
    style: StyleDefinition,
  ): Promise<ResolvedStyleAssets>;
}

export interface DocumentRepository {
  /** Callback operations are bound to the same database transaction. */
  transaction<T>(
    operation: (
      repository: DocumentRepository,
      audit: AuditWriter,
    ) => Promise<T>,
  ): Promise<T>;
  companyExists(workspaceId: string, companyId: string): Promise<boolean>;
  findActiveStyle(
    workspaceId: string,
    companyId: string,
    styleId: string,
  ): Promise<
    | {
        id: string;
        activeVersionId: string | null;
        definition: StyleDefinition;
      }
    | undefined
  >;
  findStyleVersion(
    workspaceId: string,
    companyId: string,
    styleVersionId: string,
  ): Promise<{ id: string; definition: StyleDefinition } | undefined>;
  findActiveStyleVersion(
    workspaceId: string,
    companyId: string,
    styleVersionId: string,
  ): Promise<{ id: string; definition: StyleDefinition } | undefined>;
  findActiveTemplate(
    workspaceId: string,
    companyId: string,
    templateId: string,
  ): Promise<
    | { templateId: string; versionId: string; definition: TemplateDefinition }
    | undefined
  >;
  findTemplateVersion(
    workspaceId: string,
    companyId: string,
    templateVersionId: string,
  ): Promise<
    | { templateId: string; versionId: string; definition: TemplateDefinition }
    | undefined
  >;
  findDocument(
    workspaceId: string,
    documentId: string,
  ): Promise<Document | undefined>;
  listDocuments(workspaceId: string, companyId?: string): Promise<Document[]>;
  lockDocument(
    workspaceId: string,
    documentId: string,
  ): Promise<Document | undefined>;
  insertDocument(
    input: Readonly<{
      workspaceId: string;
      companyId: string;
      templateId?: string | undefined;
      title: string;
      metadata?: Record<string, string>;
    }>,
  ): Promise<Document>;
  touchDocument(
    workspaceId: string,
    documentId: string,
  ): Promise<Document | undefined>;
  /** Must be called inside `transaction` before mutating a company repository. */
  lockCompanyForGitWrites(
    workspaceId: string,
    companyId: string,
  ): Promise<void>;
}

export interface TemplateAssetResolver {
  resolve(
    workspaceId: string,
    companyId: string,
    imageIds: readonly string[],
  ): Promise<ResolvedTemplateAssets>;
}

export interface DocumentServiceDependencies {
  readonly repository: DocumentRepository;
  readonly git: Pick<
    CompanyDocumentGitStore,
    | "write"
    | "readCurrent"
    | "readHistorical"
    | "history"
    | "revert"
    | "checkpoint"
    | "restoreCheckpoint"
    | "completeCheckpoint"
  >;
  readonly renderer: Renderer;
  readonly sourceBuilder: DocumentSourceBuilder;
  readonly styleAssetResolver?: StyleAssetResolver;
  readonly templateAssetResolver?: TemplateAssetResolver;
  readonly audit?: AuditWriter;
  readonly operations?: Pick<
    MutationOperationJournal,
    "begin" | "markExternalApplied" | "requireReconciliation" | "complete"
  >;
}
