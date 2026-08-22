import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@hypergendoc/db";
import {
  companies,
  styles,
  styleVersions,
  templates,
  templateVersions,
} from "@hypergendoc/db";
import type {
  Template,
  TemplateDefinition,
  TemplateVersion,
} from "@hypergendoc/contracts";
import type { TemplateOperations, TemplateRepository } from "./service.js";
import { createTransactionAuditWriter } from "../../platform/audit.js";

const template = (row: typeof templates.$inferSelect): Template => ({
  id: row.id,
  companyId: row.companyId,
  name: row.name,
  activeVersionId: row.activeVersionId,
  createdAt: row.createdAt.toISOString(),
});

const version = (
  row: typeof templateVersions.$inferSelect,
): TemplateVersion => ({
  id: row.id,
  templateId: row.templateId,
  version: row.version,
  definition: row.definition as TemplateDefinition,
  createdByUserId: row.createdByUserId ?? "",
  createdAt: row.createdAt.toISOString(),
});

type Db = Database;

function operations(db: Db): TemplateOperations {
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
    async styleVersionBelongsToCompany(workspaceId, companyId, versionId) {
      const [row] = await db
        .select({ id: styleVersions.id })
        .from(styleVersions)
        .innerJoin(
          styles,
          and(
            eq(styles.workspaceId, styleVersions.workspaceId),
            eq(styles.id, styleVersions.styleId),
          ),
        )
        .where(
          and(
            eq(styleVersions.workspaceId, workspaceId),
            eq(styleVersions.id, versionId),
            eq(styles.companyId, companyId),
          ),
        );
      return row !== undefined;
    },
    async list(workspaceId, companyId) {
      return (
        await db
          .select()
          .from(templates)
          .where(
            and(
              eq(templates.workspaceId, workspaceId),
              eq(templates.companyId, companyId),
            ),
          )
          .orderBy(asc(templates.createdAt))
      ).map(template);
    },
    async find(workspaceId, templateId) {
      const [row] = await db
        .select()
        .from(templates)
        .where(
          and(
            eq(templates.workspaceId, workspaceId),
            eq(templates.id, templateId),
          ),
        );
      return row && template(row);
    },
    async listVersions(workspaceId, templateId) {
      return (
        await db
          .select()
          .from(templateVersions)
          .where(
            and(
              eq(templateVersions.workspaceId, workspaceId),
              eq(templateVersions.templateId, templateId),
            ),
          )
          .orderBy(asc(templateVersions.version))
      ).map(version);
    },
    async findVersion(workspaceId, templateId, versionId) {
      const [row] = await db
        .select()
        .from(templateVersions)
        .where(
          and(
            eq(templateVersions.workspaceId, workspaceId),
            eq(templateVersions.templateId, templateId),
            eq(templateVersions.id, versionId),
          ),
        );
      return row && version(row);
    },
    async createTemplate(input) {
      const [row] = await db.insert(templates).values(input).returning();
      if (!row) throw new Error("template insert did not return a row");
      return template(row);
    },
    async createNextVersion(input) {
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId} || ':' || ${input.templateId}))`,
      );
      const [last] = await db
        .select({ version: templateVersions.version })
        .from(templateVersions)
        .where(
          and(
            eq(templateVersions.workspaceId, input.workspaceId),
            eq(templateVersions.templateId, input.templateId),
          ),
        )
        .orderBy(desc(templateVersions.version))
        .limit(1);
      const [row] = await db
        .insert(templateVersions)
        .values({
          ...input,
          styleVersionId: input.definition.styleVersionId,
          version: (last?.version ?? 0) + 1,
        })
        .returning();
      if (!row) throw new Error("template version insert did not return a row");
      return version(row);
    },
    async setActiveVersion(workspaceId, templateId, versionId) {
      const rows = await db
        .update(templates)
        .set({ activeVersionId: versionId, updatedAt: new Date() })
        .where(
          and(
            eq(templates.workspaceId, workspaceId),
            eq(templates.id, templateId),
            sql`exists (select 1 from template_versions v where v.id = ${versionId} and v.template_id = ${templateId} and v.workspace_id = ${workspaceId})`,
          ),
        )
        .returning({ id: templates.id });
      return rows.length === 1;
    },
  };
}

export function createTemplateRepository(db: Database): TemplateRepository {
  const root = operations(db);
  return {
    ...root,
    transaction: (operation) =>
      db.transaction((tx) =>
        operation(operations(tx as Db), createTransactionAuditWriter(tx)),
      ),
  };
}
