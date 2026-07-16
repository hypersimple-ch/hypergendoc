import type {
  Document,
  DocumentVersion,
  StyleDefinition,
} from "@hypergendoc/contracts";
import type { AuditWriter } from "../../platform/audit.js";
import type { ObjectStore, StoredObject } from "../../platform/object-store.js";
import type { Renderer } from "./renderer-client.js";

export interface ResolvedDocumentSource {
  readonly normalizedBody: string;
  /** Complete server-owned TeX source, not user input. */
  readonly source: string;
}

/** Kept injectable because source generation and renderer must use the same pinned wrapper. */
export interface DocumentSourceBuilder {
  resolve(body: string, style: StyleDefinition): ResolvedDocumentSource;
}

export interface StoredObjectRow {
  readonly id: string;
  readonly objectKey: string;
}

export interface DocumentVersionRow extends DocumentVersion {
  readonly sourceObjectId: string | null;
  readonly pdfObjectId: string | null;
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
  /** Looks up any historical version in the document's company for exact inheritance. */
  findStyleVersion(
    workspaceId: string,
    companyId: string,
    styleVersionId: string,
  ): Promise<{ id: string; definition: StyleDefinition } | undefined>;
  /** Looks up only the currently active version of a style in this company. */
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
  /** Must use SELECT ... FOR UPDATE before allocating a revision. */
  lockDocument(
    workspaceId: string,
    documentId: string,
  ): Promise<Document | undefined>;
  findVersion(
    workspaceId: string,
    documentId: string,
    version: number,
  ): Promise<DocumentVersionRow | undefined>;
  listVersions(
    workspaceId: string,
    documentId: string,
  ): Promise<DocumentVersionRow[]>;
  findLatestVersion(
    workspaceId: string,
    documentId: string,
  ): Promise<DocumentVersionRow | undefined>;
  insertDocument(
    input: Readonly<{ workspaceId: string; companyId: string; title: string }>,
  ): Promise<Document>;
  insertVersion(
    input: Readonly<{
      workspaceId: string;
      documentId: string;
      version: number;
      styleVersionId: string;
      normalizedBody: string;
      inputHash: string;
      createdByType: "user" | "credential";
      createdById: string;
    }>,
  ): Promise<DocumentVersionRow>;
  insertRenderRecord(
    input: Readonly<{
      workspaceId: string;
      documentVersionId: string;
      inputHash: string;
    }>,
  ): Promise<void>;
  insertStoredObject(
    input: Readonly<{
      workspaceId: string;
      companyId: string;
      purpose: "source" | "pdf";
      object: StoredObject;
    }>,
  ): Promise<StoredObjectRow>;
  /** Atomically mark both rows ready and advance only for a newer version. */
  markReadyAndAdvanceCurrent(
    input: Readonly<{
      workspaceId: string;
      documentId: string;
      documentVersionId: string;
      sourceObjectId: string;
      pdfObjectId: string;
      sourceHash: string;
      outputHash: string;
      rendererVersion: string;
    }>,
  ): Promise<void>;
  markFailed(
    input: Readonly<{
      workspaceId: string;
      documentVersionId: string;
      rendererVersion: string;
      safeDiagnostic: string;
    }>,
  ): Promise<void>;
  findArtifact(
    workspaceId: string,
    documentId: string,
    version: number,
    kind: "source" | "pdf",
  ): Promise<{ objectKey: string; companyId: string } | undefined>;
}

export interface DocumentServiceDependencies {
  readonly repository: DocumentRepository;
  readonly renderer: Renderer;
  readonly sourceBuilder: DocumentSourceBuilder;
  readonly objects: ObjectStore;
  readonly audit?: AuditWriter;
}
