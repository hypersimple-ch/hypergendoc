import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import {
  companies,
  createDatabase,
  documents,
  storedObjects,
  styleVersions,
  styles,
  workspaces,
  type Database,
} from "@hypergendoc/db";
import {
  createDocumentRepository,
  type GitDocumentRepository,
} from "./repository.js";

const databaseUrl = process.env.HYPERGENDOC_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
let db: Database;
let close: () => Promise<void>;

integration("Git document repository PostgreSQL", () => {
  beforeAll(() => {
    const connection = createDatabase({ connectionString: databaseUrl });
    db = connection.db;
    close = () => connection.pool.end();
  });
  afterAll(() => close());

  it("keeps document index operations workspace-isolated and serializes company Git writes", async () => {
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const styleId = randomUUID();
    const styleVersionId = randomUUID();
    const repository: GitDocumentRepository = createDocumentRepository(db);
    try {
      await db.insert(workspaces).values([
        { id: workspaceId, name: "documents" },
        { id: otherWorkspaceId, name: "other" },
      ]);
      await db.insert(companies).values([
        { id: companyId, workspaceId, name: "company" },
        { id: otherCompanyId, workspaceId: otherWorkspaceId, name: "other" },
      ]);
      await db.insert(styles).values({
        id: styleId,
        workspaceId,
        companyId,
        name: "preserved style",
      });
      await db.insert(styleVersions).values({
        id: styleVersionId,
        workspaceId,
        styleId,
        version: 1,
        definition: { font: "serif" },
      });
      await db
        .update(styles)
        .set({ activeVersionId: styleVersionId })
        .where(eq(styles.id, styleId));
      await db.insert(storedObjects).values({
        workspaceId,
        companyId,
        purpose: "logo",
        objectKey: `logo-${randomUUID()}`,
        contentType: "image/svg+xml",
        byteSize: 4,
        sha256: hash("logo"),
      });

      const document = await repository.insertDocument({
        workspaceId,
        companyId,
        title: "Git indexed",
      });
      expect(await repository.companyExists(workspaceId, companyId)).toBe(true);
      expect(await repository.companyExists(otherWorkspaceId, companyId)).toBe(
        false,
      );
      expect(
        await repository.findDocument(otherWorkspaceId, document.id),
      ).toBeUndefined();
      expect(
        await repository.listDocuments(workspaceId, companyId),
      ).toMatchObject([{ id: document.id, title: "Git indexed" }]);
      expect(await repository.listDocuments(otherWorkspaceId)).toEqual([]);
      expect(
        await repository.findActiveStyle(workspaceId, companyId, styleId),
      ).toMatchObject({
        id: styleId,
        activeVersionId: styleVersionId,
      });

      const touched = await repository.touchDocument(workspaceId, document.id);
      expect(touched?.updatedAt).toBeDefined();
      expect(
        await repository.touchDocument(otherWorkspaceId, document.id),
      ).toBeUndefined();
      await repository.transaction(async (tx) => {
        expect(await tx.lockDocument(workspaceId, document.id)).toMatchObject({
          id: document.id,
        });
        await tx.lockCompanyForGitWrites(workspaceId, companyId);
        const contender = new Pool({ connectionString: databaseUrl });
        try {
          const locked = await contender.query<{ locked: boolean }>(
            `select pg_try_advisory_xact_lock(hashtextextended('${workspaceId}:${companyId}', 0)) as locked`,
          );
          expect(locked.rows[0]?.locked).toBe(false);
        } finally {
          await contender.end();
        }
      });

      await db
        .delete(storedObjects)
        .where(eq(storedObjects.workspaceId, workspaceId));
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      expect(
        await db.select().from(documents).where(eq(documents.id, document.id)),
      ).toEqual([]);
    } finally {
      await db
        .delete(storedObjects)
        .where(eq(storedObjects.workspaceId, workspaceId));
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId));
    }
  });
});
