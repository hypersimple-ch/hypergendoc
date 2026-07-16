import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@hypergendoc/db";
import {
  companies,
  storedObjects,
  styles,
  styleVersions,
} from "@hypergendoc/db";
import type {
  Style,
  StyleDefinition,
  StyleVersion,
} from "@hypergendoc/contracts";
import type { StyleOperations, StyleRepository } from "./service.js";

const style = (row: typeof styles.$inferSelect): Style => ({
  id: row.id,
  companyId: row.companyId,
  name: row.name,
  activeVersionId: row.activeVersionId,
  archivedAt: row.archivedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});
const version = (row: typeof styleVersions.$inferSelect): StyleVersion => ({
  id: row.id,
  styleId: row.styleId,
  version: row.version,
  definition: row.definition as StyleDefinition,
  createdByUserId: row.createdByUserId ?? "",
  createdAt: row.createdAt.toISOString(),
});
type Db = Database;

function operations(db: Db): StyleOperations {
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
    async logoBelongsToCompany(workspaceId, companyId, objectId) {
      const [row] = await db
        .select({ id: storedObjects.id })
        .from(storedObjects)
        .where(
          and(
            eq(storedObjects.workspaceId, workspaceId),
            eq(storedObjects.companyId, companyId),
            eq(storedObjects.id, objectId),
            eq(storedObjects.purpose, "logo"),
            isNull(storedObjects.deletedAt),
          ),
        );
      return row !== undefined;
    },
    async list(workspaceId, companyId) {
      return (
        await db
          .select()
          .from(styles)
          .where(
            and(
              eq(styles.workspaceId, workspaceId),
              eq(styles.companyId, companyId),
            ),
          )
          .orderBy(asc(styles.createdAt))
      ).map(style);
    },
    async find(workspaceId, styleId) {
      const [row] = await db
        .select()
        .from(styles)
        .where(
          and(eq(styles.workspaceId, workspaceId), eq(styles.id, styleId)),
        );
      return row && style(row);
    },
    async listVersions(workspaceId, styleId) {
      return (
        await db
          .select()
          .from(styleVersions)
          .where(
            and(
              eq(styleVersions.workspaceId, workspaceId),
              eq(styleVersions.styleId, styleId),
            ),
          )
          .orderBy(asc(styleVersions.version))
      ).map(version);
    },
    async findVersion(workspaceId, styleId, versionId) {
      const [row] = await db
        .select()
        .from(styleVersions)
        .where(
          and(
            eq(styleVersions.workspaceId, workspaceId),
            eq(styleVersions.styleId, styleId),
            eq(styleVersions.id, versionId),
          ),
        );
      return row && version(row);
    },
    async createStyle(input) {
      const [row] = await db.insert(styles).values(input).returning();
      if (!row) throw new Error("style insert did not return a row");
      return style(row);
    },
    async createNextVersion(input) {
      // The advisory lock covers an empty history too; uniqueness remains the final DB guard.
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId} || ':' || ${input.styleId}))`,
      );
      const [last] = await db
        .select({ version: styleVersions.version })
        .from(styleVersions)
        .where(
          and(
            eq(styleVersions.workspaceId, input.workspaceId),
            eq(styleVersions.styleId, input.styleId),
          ),
        )
        .orderBy(desc(styleVersions.version))
        .limit(1);
      const [row] = await db
        .insert(styleVersions)
        .values({ ...input, version: (last?.version ?? 0) + 1 })
        .returning();
      if (!row) throw new Error("style version insert did not return a row");
      return version(row);
    },
    async setActiveVersion(workspaceId, styleId, versionId) {
      const rows = await db
        .update(styles)
        .set({ activeVersionId: versionId, updatedAt: new Date() })
        .where(
          and(
            eq(styles.workspaceId, workspaceId),
            eq(styles.id, styleId),
            sql`exists (select 1 from style_versions v where v.id = ${versionId} and v.style_id = ${styleId} and v.workspace_id = ${workspaceId})`,
          ),
        )
        .returning({ id: styles.id });
      return rows.length === 1;
    },
  };
}

export function createStyleRepository(db: Database): StyleRepository {
  const root = operations(db);
  return {
    ...root,
    transaction: (operation) =>
      db.transaction((tx) => operation(operations(tx as Db))),
  };
}
