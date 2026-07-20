import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  auditEvents,
  companies,
  createDatabase,
  documentVersions,
  documents,
  memberships,
  renderRecords,
  styleVersions,
  storedObjects,
  styles,
  withPurgeTransaction,
  users,
  workspaces,
  type Database,
} from "@hypergendoc/db";
import { createDocumentRepository } from "./repository.js";

const databaseUrl = process.env.HYPERGENDOC_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
let db: Database;
let close: () => Promise<void>;

integration("document repository PostgreSQL lifecycle", () => {
  beforeAll(() => {
    const connection = createDatabase({ connectionString: databaseUrl });
    db = connection.db;
    close = () => connection.pool.end();
  });
  afterAll(() => close());

  it("keeps pending evidence null, then atomically links company-bound artifacts and render evidence", async () => {
    const workspaceId = randomUUID();
    const companyId = randomUUID();
    const userId = `document-test-${randomUUID()}`;
    const sourceHash = hash("source");
    const outputHash = hash("pdf");
    await db.insert(users).values({
      id: userId,
      name: "Document Test",
      email: `${userId}@example.test`,
    });
    await db.insert(workspaces).values({ id: workspaceId, name: "documents" });
    await db
      .insert(companies)
      .values({ id: companyId, workspaceId, name: "company" });
    await db
      .insert(memberships)
      .values({ workspaceId, userId, role: "member" });
    await db.insert(auditEvents).values({
      workspaceId,
      actorType: "user",
      actorId: userId,
      action: "document.created",
      targetType: "document",
      targetId: workspaceId,
      requestId: randomUUID(),
      outcome: "success",
    });
    let cascadeWorkspaceId: string | undefined;
    let postPurgeWorkspaceId: string | undefined;
    try {
      const repository = createDocumentRepository(db);
      const { document, version } = await repository.transaction(async (tx) => {
        const style = await tx.insertDocument({
          workspaceId,
          companyId,
          title: "style holder",
        });
        // The repository only needs a valid style-version FK; create its lineage directly.
        const styleId = randomUUID();
        const styleVersionId = randomUUID();
        await db.insert(styles).values({
          id: styleId,
          workspaceId,
          companyId,
          name: `style-${styleId}`,
        });
        await db.insert(styleVersions).values({
          id: styleVersionId,
          workspaceId,
          styleId,
          version: 1,
          definition: {},
        });
        await db
          .update(styles)
          .set({ activeVersionId: styleVersionId })
          .where(eq(styles.id, styleId));
        const version = await tx.insertVersion({
          workspaceId,
          documentId: style.id,
          version: 1,
          styleVersionId,
          format: "markdown",
          body: "body",
          inputHash: hash("body"),
          createdByType: "user",
          createdById: userId,
        });
        await tx.insertRenderRecord({
          workspaceId,
          documentVersionId: version.id,
          inputHash: version.inputHash,
        });
        return { document: style, version };
      });
      const [pending] = await db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, version.id));
      expect(pending).toMatchObject({
        status: "pending",
        sourceHash: null,
        rendererVersion: null,
      });
      await repository.transaction(async (tx) => {
        const source = await tx.insertStoredObject({
          workspaceId,
          companyId,
          purpose: "source",
          object: {
            key: `source-${randomUUID()}`,
            sha256: sourceHash,
            bytes: 6,
            contentType: "text/html; charset=utf-8",
          },
        });
        const pdf = await tx.insertStoredObject({
          workspaceId,
          companyId,
          purpose: "pdf",
          object: {
            key: `pdf-${randomUUID()}`,
            sha256: outputHash,
            bytes: 3,
            contentType: "application/pdf",
          },
        });
        await tx.markReadyAndAdvanceCurrent({
          workspaceId,
          documentId: document.id,
          documentVersionId: version.id,
          sourceObjectId: source.id,
          pdfObjectId: pdf.id,
          sourceHash,
          outputHash,
          rendererVersion: "renderer-1",
        });
      });
      const [ready] = await db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, version.id));
      const [record] = await db
        .select()
        .from(renderRecords)
        .where(eq(renderRecords.documentVersionId, version.id));
      const [current] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, document.id));
      expect(ready).toMatchObject({ status: "ready", sourceHash, outputHash });
      expect(record).toMatchObject({
        status: "ready",
        sourceHash,
        outputHash,
        rendererVersion: "renderer-1",
      });
      expect(current?.currentVersionId).toBe(version.id);

      await expect(
        db.delete(workspaces).where(eq(workspaces.id, workspaceId)),
      ).rejects.toThrow();

      await withPurgeTransaction(db, async (tx) => {
        await tx
          .delete(documents)
          .where(eq(documents.workspaceId, workspaceId));
        await tx.delete(styles).where(eq(styles.workspaceId, workspaceId));
        await tx
          .delete(storedObjects)
          .where(eq(storedObjects.workspaceId, workspaceId));
        await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
      });
      expect(
        await db
          .select()
          .from(styleVersions)
          .where(eq(styleVersions.workspaceId, workspaceId)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(documentVersions)
          .where(eq(documentVersions.workspaceId, workspaceId)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(renderRecords)
          .where(eq(renderRecords.workspaceId, workspaceId)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.workspaceId, workspaceId)),
      ).toEqual([]);

      const cascadeWorkspace = randomUUID();
      cascadeWorkspaceId = cascadeWorkspace;
      const cascadeCompanyId = randomUUID();
      const cascadeStyleId = randomUUID();
      const cascadeStyleVersionId = randomUUID();
      const cascadeDocumentId = randomUUID();
      const cascadeDocumentVersionId = randomUUID();
      await db
        .insert(workspaces)
        .values({ id: cascadeWorkspaceId, name: "purge-cascade" });
      await db.insert(companies).values({
        id: cascadeCompanyId,
        workspaceId: cascadeWorkspaceId,
        name: "purge-cascade",
      });
      await db
        .insert(memberships)
        .values({ workspaceId: cascadeWorkspaceId, userId, role: "member" });
      await db.insert(styles).values({
        id: cascadeStyleId,
        workspaceId: cascadeWorkspaceId,
        companyId: cascadeCompanyId,
        name: "purge-cascade",
      });
      await db.insert(styleVersions).values({
        id: cascadeStyleVersionId,
        workspaceId: cascadeWorkspaceId,
        styleId: cascadeStyleId,
        version: 1,
        definition: {},
      });
      await db.insert(documents).values({
        id: cascadeDocumentId,
        workspaceId: cascadeWorkspaceId,
        companyId: cascadeCompanyId,
        title: "purge-cascade",
      });
      await db.insert(documentVersions).values({
        id: cascadeDocumentVersionId,
        workspaceId: cascadeWorkspaceId,
        documentId: cascadeDocumentId,
        version: 1,
        styleVersionId: cascadeStyleVersionId,
        format: "markdown",
        body: "body",
        inputHash: hash("purge-cascade"),
        createdByActorType: "user",
        createdByActorId: userId,
      });
      await db.insert(renderRecords).values({
        workspaceId: cascadeWorkspaceId,
        documentVersionId: cascadeDocumentVersionId,
        inputHash: hash("purge-cascade"),
      });
      await db.insert(auditEvents).values({
        workspaceId: cascadeWorkspaceId,
        actorType: "user",
        actorId: userId,
        action: "purge.cascade",
        targetType: "workspace",
        targetId: cascadeWorkspaceId,
        requestId: randomUUID(),
        outcome: "success",
      });
      await withPurgeTransaction(db, async (tx) => {
        await tx.delete(workspaces).where(eq(workspaces.id, cascadeWorkspace));
      });
      expect(
        await db
          .select()
          .from(styleVersions)
          .where(eq(styleVersions.workspaceId, cascadeWorkspaceId)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(documentVersions)
          .where(eq(documentVersions.workspaceId, cascadeWorkspaceId)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(renderRecords)
          .where(eq(renderRecords.workspaceId, cascadeWorkspaceId)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.workspaceId, cascadeWorkspaceId)),
      ).toEqual([]);

      postPurgeWorkspaceId = randomUUID();
      await db
        .insert(workspaces)
        .values({ id: postPurgeWorkspaceId, name: "post-purge" });
      await db.insert(auditEvents).values({
        workspaceId: postPurgeWorkspaceId,
        actorType: "user",
        actorId: userId,
        action: "purge.checked",
        targetType: "workspace",
        targetId: postPurgeWorkspaceId,
        requestId: randomUUID(),
        outcome: "success",
      });
      await expect(
        db.delete(workspaces).where(eq(workspaces.id, postPurgeWorkspaceId)),
      ).rejects.toThrow();
    } finally {
      await withPurgeTransaction(db, async (tx) => {
        await tx
          .delete(documents)
          .where(eq(documents.workspaceId, workspaceId));
        await tx.delete(styles).where(eq(styles.workspaceId, workspaceId));
        await tx
          .delete(storedObjects)
          .where(eq(storedObjects.workspaceId, workspaceId));
        await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
        if (cascadeWorkspaceId) {
          await tx
            .delete(workspaces)
            .where(eq(workspaces.id, cascadeWorkspaceId));
        }
        if (postPurgeWorkspaceId) {
          await tx
            .delete(workspaces)
            .where(eq(workspaces.id, postPurgeWorkspaceId));
        }
        await tx.delete(users).where(eq(users.id, userId));
      });
    }
  });
});
