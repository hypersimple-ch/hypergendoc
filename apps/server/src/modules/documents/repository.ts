import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@hypergendoc/db";
import { companies, documents, styles, styleVersions } from "@hypergendoc/db";
import type { Document, StyleDefinition } from "@hypergendoc/contracts";
import type { DocumentRepository } from "./service-types.js";

type Db = Database;

export interface GitDocumentRepository {
  transaction<T>(
    operation: (repository: GitDocumentRepository) => Promise<T>,
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
  lockCompanyForGitWrites(
    workspaceId: string,
    companyId: string,
  ): Promise<void>;
}

const document = (row: typeof documents.$inferSelect): Document => ({
  id: row.id,
  companyId: row.companyId,
  title: row.title,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

function operations(db: Db): Omit<GitDocumentRepository, "transaction"> {
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
    async insertDocument(input) {
      const [row] = await db.insert(documents).values(input).returning();
      if (!row) throw new Error("document insert did not return a row");
      return document(row);
    },
    async touchDocument(workspaceId, documentId) {
      const [row] = await db
        .update(documents)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.id, documentId),
            isNull(documents.deletedAt),
          ),
        )
        .returning();
      return row && document(row);
    },
    async lockCompanyForGitWrites(workspaceId, companyId) {
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${workspaceId}:${companyId}`}, 0))`,
      );
    },
  };
}

export function createDocumentRepository(db: Database): DocumentRepository {
  const bind = (client: Db): GitDocumentRepository => ({
    ...operations(client),
    transaction: (operation) =>
      client.transaction((tx) => operation(bind(tx as Db))),
  });
  return bind(db);
}
