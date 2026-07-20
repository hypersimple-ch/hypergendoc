import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@hypergendoc/db";
import {
  companies,
  documents,
  documentVersions,
  renderRecords,
  storedObjects,
  styles,
  styleVersions,
} from "@hypergendoc/db";
import type { Document, StyleDefinition } from "@hypergendoc/contracts";
import type { DocumentRepository, DocumentVersionRow } from "./service.js";

type Db = Database;

const document = (row: typeof documents.$inferSelect): Document => ({
  id: row.id,
  companyId: row.companyId,
  title: row.title,
  currentVersionId: row.currentVersionId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
const version = (
  row: typeof documentVersions.$inferSelect,
): DocumentVersionRow => ({
  id: row.id,
  documentId: row.documentId,
  version: row.version,
  styleVersionId: row.styleVersionId,
  format: row.format,
  body: row.body,
  status: row.status,
  inputHash: row.inputHash,
  sourceHash: row.sourceHash,
  outputHash: row.outputHash,
  rendererVersion: row.rendererVersion,
  createdByType: row.createdByActorType as "user" | "credential",
  createdById: row.createdByActorId,
  createdAt: row.createdAt.toISOString(),
  sourceObjectId: row.sourceObjectId,
  pdfObjectId: row.pdfObjectId,
});

function operations(db: Db): Omit<DocumentRepository, "transaction"> {
  return {
    async companyExists(workspaceId, companyId) {
      const [row] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(
          and(
            eq(companies.workspaceId, workspaceId),
            eq(companies.id, companyId),
            isNull(companies.archivedAt),
          ),
        );
      return row !== undefined;
    },
    async findActiveStyle(workspaceId, companyId, styleId) {
      const [row] = await db
        .select({
          id: styles.id,
          activeVersionId: styles.activeVersionId,
          definition: styleVersions.definition,
        })
        .from(styles)
        .innerJoin(styleVersions, eq(styles.activeVersionId, styleVersions.id))
        .where(
          and(
            eq(styles.workspaceId, workspaceId),
            eq(styles.companyId, companyId),
            eq(styles.id, styleId),
            isNull(styles.archivedAt),
          ),
        );
      return row && { ...row, definition: row.definition as StyleDefinition };
    },
    async findStyleVersion(workspaceId, companyId, styleVersionId) {
      const [row] = await db
        .select({ id: styleVersions.id, definition: styleVersions.definition })
        .from(styleVersions)
        .innerJoin(styles, eq(styleVersions.styleId, styles.id))
        .where(
          and(
            eq(styleVersions.workspaceId, workspaceId),
            eq(styles.workspaceId, workspaceId),
            eq(styles.companyId, companyId),
            eq(styleVersions.id, styleVersionId),
          ),
        );
      return row && { ...row, definition: row.definition as StyleDefinition };
    },
    async findActiveStyleVersion(workspaceId, companyId, styleVersionId) {
      const [row] = await db
        .select({ id: styleVersions.id, definition: styleVersions.definition })
        .from(styleVersions)
        .innerJoin(
          styles,
          and(
            eq(styles.activeVersionId, styleVersions.id),
            eq(styles.id, styleVersions.styleId),
          ),
        )
        .where(
          and(
            eq(styleVersions.workspaceId, workspaceId),
            eq(styles.workspaceId, workspaceId),
            eq(styles.companyId, companyId),
            eq(styleVersions.id, styleVersionId),
            isNull(styles.archivedAt),
          ),
        );
      return row && { ...row, definition: row.definition as StyleDefinition };
    },
    async findDocument(workspaceId, documentId) {
      const [row] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.id, documentId),
            isNull(documents.deletedAt),
          ),
        );
      return row && document(row);
    },
    async listDocuments(workspaceId, companyId) {
      return (
        await db
          .select()
          .from(documents)
          .where(
            and(
              eq(documents.workspaceId, workspaceId),
              isNull(documents.deletedAt),
              ...(companyId ? [eq(documents.companyId, companyId)] : []),
            ),
          )
          .orderBy(asc(documents.createdAt))
      ).map(document);
    },
    async lockDocument(workspaceId, documentId) {
      const [row] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.id, documentId),
            isNull(documents.deletedAt),
          ),
        )
        .for("update");
      return row && document(row);
    },
    async findVersion(workspaceId, documentId, number) {
      const [row] = await db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.workspaceId, workspaceId),
            eq(documentVersions.documentId, documentId),
            eq(documentVersions.version, number),
          ),
        );
      return row && version(row);
    },
    async listVersions(workspaceId, documentId) {
      return (
        await db
          .select()
          .from(documentVersions)
          .where(
            and(
              eq(documentVersions.workspaceId, workspaceId),
              eq(documentVersions.documentId, documentId),
            ),
          )
          .orderBy(asc(documentVersions.version))
      ).map(version);
    },
    async findLatestVersion(workspaceId, documentId) {
      const [row] = await db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.workspaceId, workspaceId),
            eq(documentVersions.documentId, documentId),
          ),
        )
        .orderBy(desc(documentVersions.version))
        .limit(1);
      return row && version(row);
    },
    async insertDocument(input) {
      const [row] = await db.insert(documents).values(input).returning();
      if (!row) throw new Error("document insert did not return a row");
      return document(row);
    },
    async insertVersion(input) {
      const [row] = await db
        .insert(documentVersions)
        .values({
          workspaceId: input.workspaceId,
          documentId: input.documentId,
          version: input.version,
          styleVersionId: input.styleVersionId,
          format: input.format,
          body: input.body,
          inputHash: input.inputHash,
          createdByActorType: input.createdByType,
          createdByActorId: input.createdById,
        })
        .returning();
      if (!row) throw new Error("document version insert did not return a row");
      return version(row);
    },
    async insertRenderRecord(input) {
      await db.insert(renderRecords).values({
        workspaceId: input.workspaceId,
        documentVersionId: input.documentVersionId,
        inputHash: input.inputHash,
        startedAt: new Date(),
      });
    },
    async insertStoredObject(input) {
      const [row] = await db
        .insert(storedObjects)
        .values({
          workspaceId: input.workspaceId,
          companyId: input.companyId,
          purpose: input.purpose,
          objectKey: input.object.key,
          contentType: input.object.contentType,
          byteSize: input.object.bytes,
          sha256: input.object.sha256,
        })
        .returning({
          id: storedObjects.id,
          objectKey: storedObjects.objectKey,
        });
      if (!row) throw new Error("stored object insert did not return a row");
      return row;
    },
    async markReadyAndAdvanceCurrent(input) {
      // Lifecycle fields are the only mutable evidence fields; the schema trigger
      // intentionally rejects rewrites of body/style/source identity.
      const updated = await db
        .update(documentVersions)
        .set({
          status: "ready",
          sourceHash: input.sourceHash,
          outputHash: input.outputHash,
          sourceObjectId: input.sourceObjectId,
          pdfObjectId: input.pdfObjectId,
          rendererVersion: input.rendererVersion,
        })
        .where(
          and(
            eq(documentVersions.workspaceId, input.workspaceId),
            eq(documentVersions.id, input.documentVersionId),
            eq(documentVersions.status, "pending"),
          ),
        )
        .returning({ id: documentVersions.id });
      if (updated.length !== 1)
        throw new Error("document version is not pending");
      const evidence = await db
        .update(renderRecords)
        .set({
          status: "ready",
          sourceHash: input.sourceHash,
          outputHash: input.outputHash,
          rendererVersion: input.rendererVersion,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(renderRecords.workspaceId, input.workspaceId),
            eq(renderRecords.documentVersionId, input.documentVersionId),
            eq(renderRecords.status, "pending"),
          ),
        )
        .returning({ id: renderRecords.id });
      if (evidence.length !== 1)
        throw new Error("render record is not pending");
      await db
        .update(documents)
        .set({
          currentVersionId: input.documentVersionId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(documents.workspaceId, input.workspaceId),
            eq(documents.id, input.documentId),
            sql`exists (select 1 from document_versions v where v.id = ${input.documentVersionId} and v.document_id = ${input.documentId} and v.workspace_id = ${input.workspaceId} and v.status = 'ready')`,
            sql`coalesce((select v.version from document_versions v where v.id = documents.current_version_id), 0) < (select v.version from document_versions v where v.id = ${input.documentVersionId})`,
          ),
        );
    },
    async markFailed(input) {
      await db
        .update(documentVersions)
        .set({
          status: "failed",
          rendererVersion: input.rendererVersion,
          safeDiagnostics: { error: input.safeDiagnostic },
        })
        .where(
          and(
            eq(documentVersions.workspaceId, input.workspaceId),
            eq(documentVersions.id, input.documentVersionId),
            eq(documentVersions.status, "pending"),
          ),
        );
      await db
        .update(renderRecords)
        .set({
          status: "failed",
          rendererVersion: input.rendererVersion,
          safeDiagnostics: { error: input.safeDiagnostic },
          completedAt: new Date(),
        })
        .where(
          and(
            eq(renderRecords.workspaceId, input.workspaceId),
            eq(renderRecords.documentVersionId, input.documentVersionId),
            eq(renderRecords.status, "pending"),
          ),
        );
    },
    async findArtifact(workspaceId, documentId, number, kind) {
      const objectId = documentVersions.pdfObjectId;
      const [row] = await db
        .select({
          objectKey: storedObjects.objectKey,
          companyId: storedObjects.companyId,
        })
        .from(documentVersions)
        .innerJoin(documents, eq(documentVersions.documentId, documents.id))
        .innerJoin(storedObjects, eq(objectId, storedObjects.id))
        .where(
          and(
            eq(documentVersions.workspaceId, workspaceId),
            eq(documentVersions.documentId, documentId),
            eq(documentVersions.version, number),
            eq(documents.workspaceId, workspaceId),
            eq(storedObjects.workspaceId, workspaceId),
            eq(storedObjects.purpose, kind),
            isNull(storedObjects.deletedAt),
          ),
        );
      return row?.companyId
        ? { objectKey: row.objectKey, companyId: row.companyId }
        : undefined;
    },
  };
}

export function createDocumentRepository(db: Database): DocumentRepository {
  const bind = (client: Db): DocumentRepository => ({
    ...operations(client),
    transaction: (operation) =>
      client.transaction((tx) => operation(bind(tx as Db))),
  });
  return bind(db);
}
