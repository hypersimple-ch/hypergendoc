import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "@hypergendoc/db";
import {
  companies,
  companyColors,
  companyFonts,
  storedObjects,
} from "@hypergendoc/db";
import type {
  Company,
  CompanyAssets,
  CreateCompanyInput,
} from "@hypergendoc/contracts";
import { FontFamilySchema } from "@hypergendoc/contracts";
import type { LogoOwnershipRepository } from "../../platform/logo-upload.js";
import type { CompanyAssetRepository } from "./assets.js";
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

export function createCompanyAssetRepository(
  db: Database,
): CompanyAssetRepository {
  const builtInFonts = FontFamilySchema.options;
  return {
    async list(workspaceId, companyId): Promise<CompanyAssets> {
      const [logos, uploadedFonts, ownedBuiltIns, colors] = await Promise.all([
        db
          .select({
            id: storedObjects.id,
            displayName: storedObjects.displayName,
            contentType: storedObjects.contentType,
            byteSize: storedObjects.byteSize,
            createdAt: storedObjects.createdAt,
          })
          .from(storedObjects)
          .where(
            and(
              eq(storedObjects.workspaceId, workspaceId),
              eq(storedObjects.companyId, companyId),
              eq(storedObjects.purpose, "logo"),
              isNull(storedObjects.deletedAt),
            ),
          ),
        db
          .select({
            id: storedObjects.id,
            displayName: storedObjects.displayName,
            familyName: companyFonts.familyName,
            subfamilyName: companyFonts.subfamilyName,
          })
          .from(companyFonts)
          .innerJoin(
            storedObjects,
            eq(companyFonts.storedObjectId, storedObjects.id),
          )
          .where(
            and(
              eq(companyFonts.workspaceId, workspaceId),
              eq(companyFonts.companyId, companyId),
              eq(storedObjects.purpose, "font"),
              isNull(storedObjects.deletedAt),
            ),
          ),
        db
          .select({ family: companyFonts.builtInFamily })
          .from(companyFonts)
          .where(
            and(
              eq(companyFonts.workspaceId, workspaceId),
              eq(companyFonts.companyId, companyId),
              inArray(companyFonts.builtInFamily, builtInFonts),
            ),
          ),
        db
          .select({ color: companyColors.color })
          .from(companyColors)
          .where(
            and(
              eq(companyColors.workspaceId, workspaceId),
              eq(companyColors.companyId, companyId),
            ),
          ),
      ]);
      const owned = new Set(ownedBuiltIns.flatMap((font) => font.family ?? []));
      return {
        logos: logos.map((logo) => ({
          id: logo.id,
          displayName: logo.displayName,
          contentType: logo.contentType as
            "image/png" | "image/jpeg" | "image/webp",
          byteSize: logo.byteSize,
          contentUrl: `/api/companies/${companyId}/assets/logos/${logo.id}/content`,
          createdAt: logo.createdAt.toISOString(),
        })),
        fonts: [
          ...builtInFonts.map((family) => ({
            id: family,
            source: "built_in" as const,
            familyName: family,
            subfamilyName: null,
            displayName: family,
            owned: owned.has(family),
            contentUrl: null,
          })),
          ...uploadedFonts.map((font) => ({
            id: font.id,
            source: "uploaded" as const,
            familyName: font.familyName,
            subfamilyName: font.subfamilyName,
            displayName: font.displayName ?? font.familyName,
            owned: true,
            contentUrl: `/api/companies/${companyId}/assets/fonts/${font.id}/content`,
          })),
        ],
        colors: colors.map((color) => color.color),
      };
    },
    async findContent(workspaceId, companyId, kind, objectId) {
      const query = db
        .select({
          key: storedObjects.objectKey,
          sha256: storedObjects.sha256,
          byteSize: storedObjects.byteSize,
          contentType: storedObjects.contentType,
        })
        .from(storedObjects)
        .where(
          and(
            eq(storedObjects.workspaceId, workspaceId),
            eq(storedObjects.companyId, companyId),
            eq(storedObjects.id, objectId),
            eq(storedObjects.purpose, kind),
            isNull(storedObjects.deletedAt),
            kind === "font"
              ? sql`exists (select 1 from company_fonts f where f.workspace_id = ${workspaceId} and f.company_id = ${companyId} and f.stored_object_id = ${storedObjects.id})`
              : undefined,
          ),
        );
      const [row] = await query;
      return row;
    },
    async create(input) {
      return db.transaction(async (tx) => {
        const [object] = await tx
          .insert(storedObjects)
          .values({
            workspaceId: input.workspaceId,
            companyId: input.companyId,
            purpose: "font",
            displayName: input.displayName,
            objectKey: input.objectKey,
            contentType: input.contentType,
            byteSize: input.bytes,
            sha256: input.sha256,
          })
          .returning({ id: storedObjects.id });
        if (!object)
          throw new Error("stored object insert did not return a row");
        await tx.insert(companyFonts).values({
          workspaceId: input.workspaceId,
          companyId: input.companyId,
          storedObjectId: object.id,
          familyName: input.familyName,
          subfamilyName: input.subfamilyName,
        });
        return object;
      });
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
