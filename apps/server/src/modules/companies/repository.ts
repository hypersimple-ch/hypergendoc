import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@hypergendoc/db";
import { companies, storedObjects } from "@hypergendoc/db";
import type { Company, CreateCompanyInput } from "@hypergendoc/contracts";
import type { LogoOwnershipRepository } from "../../platform/logo-upload.js";
import type { CompanyRepository } from "./service.js";

const company = (row: typeof companies.$inferSelect): Company => ({
  id: row.id,
  workspaceId: row.workspaceId,
  name: row.name,
  archivedAt: row.archivedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** All company operations scope their target ID by the trusted workspace ID. */
export function createCompanyRepository(db: Database): CompanyRepository {
  return {
    async list(workspaceId) {
      return (
        await db
          .select()
          .from(companies)
          .where(eq(companies.workspaceId, workspaceId))
      ).map(company);
    },
    async find(workspaceId, companyId) {
      const [row] = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.workspaceId, workspaceId),
            eq(companies.id, companyId),
          ),
        );
      return row && company(row);
    },
    async create(workspaceId, input: CreateCompanyInput) {
      const [row] = await db
        .insert(companies)
        .values({ workspaceId, ...input })
        .returning();
      if (!row) throw new Error("company insert did not return a row");
      return company(row);
    },
    async update(workspaceId, companyId, input) {
      const [row] = await db
        .update(companies)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(
            eq(companies.workspaceId, workspaceId),
            eq(companies.id, companyId),
          ),
        )
        .returning();
      return row && company(row);
    },
    async archive(workspaceId, companyId) {
      const [row] = await db
        .update(companies)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(companies.workspaceId, workspaceId),
            eq(companies.id, companyId),
          ),
        )
        .returning();
      return row && company(row);
    },
  };
}

/** Persists the immutable ownership lineage immediately after the object-store upload. */
export function createLogoOwnershipRepository(
  db: Database,
): LogoOwnershipRepository {
  return {
    async create(input) {
      const [row] = await db
        .insert(storedObjects)
        .values({
          workspaceId: input.workspaceId,
          companyId: input.companyId,
          purpose: "logo",
          objectKey: input.objectKey,
          contentType: input.contentType,
          byteSize: input.bytes,
          sha256: input.sha256,
        })
        .returning({ id: storedObjects.id });
      if (!row) throw new Error("stored object insert did not return a row");
      return row;
    },
  };
}

export async function logoBelongsToCompany(
  db: Database,
  workspaceId: string,
  companyId: string,
  objectId: string,
): Promise<boolean> {
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
}
