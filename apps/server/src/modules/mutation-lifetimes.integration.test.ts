import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  auditEvents,
  companies,
  createDatabase,
  documents,
  mailJobs,
  memberships,
  mutationOperations,
  storedObjects,
  styles,
  styleVersions,
  users,
  withPurgeTransaction,
  workspaces,
  type Database,
} from "@hypergendoc/db";
import {
  CompanyImageAssetSchema,
  DocumentDetailSchema,
  ErrorEnvelopeSchema,
  StyleDefinitionSchema,
} from "@hypergendoc/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApplication, type Application } from "../app/app.js";
import type { Pool } from "pg";
import {
  loadServerEnvironment,
  type ServerEnvironment,
} from "../platform/env.js";
import { MutationOperationJournal } from "../platform/mutation-operations.js";

const enabled = process.env.RUN_PLATFORM_INTEGRATION === "true";
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

// Run only against the disposable Compose audit stack, never the working database.
// No trigger or schema change is needed: both lifetimes use real Git and S3.
describe.skipIf(!enabled)("durable mutations across application lifetimes", () => {
  const workspaceId = randomUUID();
  const companyId = randomUUID();
  const styleId = randomUUID();
  const styleVersionId = randomUUID();
  const email = `mutation-lifetimes-${randomUUID()}@example.test`;
  let userId: string | undefined;
  let cookie: string;
  let gitRoot: string | undefined;
  let environment: ServerEnvironment;
  let database: { db: Database; pool: Pool } | undefined;
  let objectClient: S3Client | undefined;
  let app: Application | undefined;

  beforeAll(async () => {
    gitRoot = await mkdtemp(join(tmpdir(), "hypergendoc-mutation-lifetimes-"));
    environment = loadServerEnvironment({
      ...process.env,
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DOCUMENT_GIT_ROOT: gitRoot,
      // Auth fixtures queue local verification mail; never dispatch through SMTP.
      SMTP_HOST: undefined,
      SMTP_PORT: undefined,
      SMTP_USER: undefined,
      SMTP_PASSWORD: undefined,
    });
    database = createDatabase({ connectionString: environment.databaseUrl });
    objectClient = new S3Client({
      region: environment.s3.region,
      ...(environment.s3.endpoint
        ? { endpoint: environment.s3.endpoint, forcePathStyle: true }
        : {}),
      credentials: {
        accessKeyId: environment.s3.accessKeyId,
        secretAccessKey: environment.s3.secretAccessKey,
      },
    });
    // Bootstrap auth separately so each measured application starts with the
    // same request sequence (document first, asset second).
    app = await createApplication(environment);
    const password = `Fixture-${randomUUID()}`;
    const signup = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin: environment.appOrigin },
      payload: { email, password, name: "Mutation lifetime fixture" },
    });
    expect(signup.statusCode).toBe(200);
    const [user] = await database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (!user) throw new Error("Fixture user was not created");
    userId = user.id;
    await database.db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, userId));
    const signin = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin: environment.appOrigin },
      payload: { email, password },
    });
    expect(signin.statusCode).toBe(200);
    cookie = signin.cookies
      .map((item) => `${item.name}=${item.value}`)
      .join("; ");
    await database.db
      .insert(workspaces)
      .values({ id: workspaceId, name: "Mutation lifetime fixture" });
    await database.db
      .insert(companies)
      .values({ id: companyId, workspaceId, name: "Fixture company" });
    await database.db
      .insert(memberships)
      .values({ workspaceId, userId, role: "owner" });
    await database.db
      .insert(styles)
      .values({ id: styleId, workspaceId, companyId, name: "Fixture style" });
    await database.db.insert(styleVersions).values({
      id: styleVersionId,
      workspaceId,
      styleId,
      version: 1,
      definition: StyleDefinitionSchema.parse({
        logoObjectId: null,
        bodyFont: "Inter",
        headingFont: "Noto Serif",
        bodySizePt: 10,
        headingScale: 1.4,
        italicStyle: "italic",
        colors: {
          text: "#17201c",
          heading: "#17201c",
          primary: "#a33b20",
          accent: "#276f62",
          muted: "#767b76",
        },
        page: {
          size: "A4",
          marginTopMm: 20,
          marginRightMm: 18,
          marginBottomMm: 20,
          marginLeftMm: 18,
        },
        header: { enabled: false },
        footer: { enabled: false },
      }),
      createdByUserId: userId,
    });
    await database.db
      .update(styles)
      .set({ activeVersionId: styleVersionId })
      .where(eq(styles.id, styleId));
    await app.closeDependencies();
    app = undefined;
  }, 60_000);

  afterAll(async () => {
    try {
      await app?.closeDependencies();
      if (database) {
        const objects = await database.db
          .select({ key: storedObjects.objectKey })
          .from(storedObjects)
          .where(eq(storedObjects.workspaceId, workspaceId));
        for (const object of objects) {
          await objectClient?.send(
            new DeleteObjectCommand({
              Bucket: environment.s3.bucket,
              Key: object.key,
            }),
          );
        }
        await withPurgeTransaction(database.db, async (tx) => {
          await tx
            .delete(auditEvents)
            .where(eq(auditEvents.workspaceId, workspaceId));
          await tx.delete(documents).where(eq(documents.workspaceId, workspaceId));
          await tx.update(styles).set({ activeVersionId: null }).where(eq(styles.workspaceId, workspaceId));
          await tx.delete(styleVersions).where(eq(styleVersions.workspaceId, workspaceId));
          await tx.delete(styles).where(eq(styles.workspaceId, workspaceId));
          await tx.delete(storedObjects).where(eq(storedObjects.workspaceId, workspaceId));
          await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
        });
        await database.db.delete(mailJobs).where(eq(mailJobs.recipient, email));
        // Email-scoped cleanup also covers a failed setup before userId assignment.
        await database.db.delete(users).where(eq(users.email, email));
      }
    } finally {
      objectClient?.destroy();
      await database?.pool.end();
      if (gitRoot) await rm(gitRoot, { recursive: true, force: true });
    }
  }, 60_000);

  it("preserves both lifetimes' documents and assets without reusing durable keys", async () => {
    if (!database) throw new Error("Fixture database is unavailable");
    const writes: Array<{
      documentId: string;
      commitSha: string;
      body: string;
      contentUrl: string;
    }> = [];
    const headers = { cookie, origin: environment.appOrigin };
    for (const lifetime of [1, 2]) {
      app = await createApplication(environment);
      const body = `# Document from lifetime ${lifetime}\n\nPersist this source.`;
      const created = await app.inject({
        method: "POST",
        url: "/api/documents",
        headers,
        payload: {
          companyId,
          styleId,
          title: `Lifetime ${lifetime}`,
          format: "markdown",
          body,
        },
      });
      const payload: unknown = created.json();
      const error = ErrorEnvelopeSchema.safeParse(payload);
      expect(created.statusCode, error.success ? error.data.error.code : undefined).toBe(200);
      const result = DocumentDetailSchema.omit({ commits: true }).parse(payload);
      const boundary = "mutation-lifetime-upload";
      const uploaded = await app.inject({
        method: "POST",
        url: `/api/companies/${companyId}/assets/images`,
        headers: {
          ...headers,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\n`,
          ),
          tinyPng,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
      });
      expect(uploaded.statusCode).toBe(201);
      const asset = CompanyImageAssetSchema.parse(uploaded.json());
      writes.push({
        documentId: result.document.id,
        commitSha: result.current.commit.commitSha,
        body,
        contentUrl: asset.contentUrl,
      });
      if (lifetime === 1) {
        await app.closeDependencies();
        app = undefined;
      }
    }
    if (!app) throw new Error("Second application is unavailable");
    for (const write of writes) {
      const detail = await app.inject({
        url: `/api/documents/${write.documentId}`,
        headers,
      });
      expect(detail.statusCode).toBe(200);
      const parsed = DocumentDetailSchema.parse(detail.json());
      expect(parsed.current.snapshot.body).toBe(write.body);
      expect(parsed.commits.map((commit) => commit.commitSha)).toContain(
        write.commitSha,
      );
      const historicalSource = await app.inject({
        url: `/api/documents/${write.documentId}/commits/${write.commitSha}/source`,
        headers,
      });
      expect(historicalSource.statusCode).toBe(200);
      expect(historicalSource.body).toBe(write.body);
      const content = await app.inject({ url: write.contentUrl, headers });
      expect(content.statusCode).toBe(200);
      expect(content.headers["content-type"]).toContain("image/png");
      expect(content.rawPayload).toEqual(tinyPng);
    }
    const operations = await database.db
      .select()
      .from(mutationOperations)
      .where(eq(mutationOperations.workspaceId, workspaceId));
    for (const operationType of ["document.create", "company.image_uploaded"]) {
      const matching = operations.filter(
        (operation) => operation.operationType === operationType,
      );
      expect(matching).toHaveLength(2);
      expect(
        new Set(matching.map((operation) => operation.idempotencyKey)).size,
      ).toBe(2);
      expect(matching.map((operation) => operation.status)).toEqual([
        "completed",
        "completed",
      ]);
    }
    const objects = await database.db
      .select()
      .from(storedObjects)
      .where(eq(storedObjects.workspaceId, workspaceId));
    expect(objects).toHaveLength(2);
    expect(new Set(objects.map((object) => object.objectKey)).size).toBe(2);
    expect(new Set(objects.map((object) => object.sha256)).size).toBe(1);

    // Unique request IDs must not weaken the journal's existing conflict guard.
    const journal = new MutationOperationJournal(database.db);
    for (const existing of operations) {
      await expect(
        journal.begin({
          workspaceId,
          idempotencyKey: existing.idempotencyKey,
          operationType: existing.operationType,
          targetType: existing.targetType,
          targetId: randomUUID(),
        }),
      ).rejects.toThrow("mutation idempotency conflict");
    }
  }, 60_000);
});
