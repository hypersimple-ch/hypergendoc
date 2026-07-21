import type {
  Document,
  DocumentFormat,
  ResolvedStyleAssets,
  StyleDefinition,
} from "@hypergendoc/contracts";
import type { AuditWriter } from "../../platform/audit.js";
import type { CompanyDocumentGitStore } from "./git-store.js";
import type { Renderer } from "./renderer-client.js";

export interface ResolvedDocumentSource {
  /** Exact user input, never normalized. */
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
    operation: (repository: DocumentRepository) => Promise<T>,
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
    input: Readonly<{ workspaceId: string; companyId: string; title: string }>,
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

export interface DocumentServiceDependencies {
  readonly repository: DocumentRepository;
  readonly git: Pick<
    CompanyDocumentGitStore,
    "write" | "readCurrent" | "readHistorical" | "history" | "revert"
  >;
  readonly renderer: Renderer;
  readonly sourceBuilder: DocumentSourceBuilder;
  readonly styleAssetResolver?: StyleAssetResolver;
  readonly audit?: AuditWriter;
}
