import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  auditEvents,
  companies,
  createDatabase,
  documents,
  mcpCredentials,
  memberships,
  mutationOperations,
  styles,
  styleVersions,
  users,
  withPurgeTransaction,
  workspaces,
} from "@hypergendoc/db";
import type { HumanActor } from "./auth/actors.js";
import { createMembershipRepository } from "./memberships/repository.js";
import { inviteMember } from "./memberships/service.js";
import { createCompanyRepository } from "./companies/repository.js";
import { createCompanyService } from "./companies/service.js";
import { createCredentialRepository } from "./credentials/repository.js";
import { createCredentialService } from "./credentials/service.js";
import { createDocumentRepository } from "./documents/repository.js";
import type { WriteDocumentGitInput } from "./documents/git-store.js";
import { createDocumentService } from "./documents/service.js";
import {
  MutationOperationJournal,
  reconcileMutationOperations,
} from "../platform/mutation-operations.js";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "true";

describe.skipIf(!enabled)("atomic PostgreSQL mutations", () => {
  const database = createDatabase({
    connectionString: process.env.DATABASE_URL,
  });
  const workspaceId = randomUUID();
  const userId = `atomic-${randomUUID()}`;
  const companyId = randomUUID();
  const invitedUserId = `atomic-invite-${randomUUID()}`;
  const styleId = randomUUID();
  const styleVersionId = randomUUID();
  const actor: HumanActor = {
    userId,
    workspaceId,
    membershipId: randomUUID(),
    role: "owner",
    requestId: "inject-audit-failure",
  };

  beforeAll(async () => {
    await database.db.insert(users).values({
      id: userId,
      name: "Atomic test",
      email: `${userId}@example.test`,
      emailVerified: true,
    });
    await database.db
      .insert(workspaces)
      .values({ id: workspaceId, name: "Atomic test" });
    await database.db
      .insert(companies)
      .values({ id: companyId, workspaceId, name: "Scope" });
    await database.db.insert(users).values({
      id: invitedUserId,
      name: "Invited test",
      email: `${invitedUserId}@example.test`,
      emailVerified: true,
    });
    await database.db
      .insert(memberships)
      .values({ workspaceId, userId, role: "owner" });
    await database.db
      .insert(styles)
      .values({ id: styleId, workspaceId, companyId, name: "Atomic style" });
    await database.db.insert(styleVersions).values({
      id: styleVersionId,
      workspaceId,
      styleId,
      version: 1,
      definition: {},
      createdByUserId: userId,
    });
    await database.db
      .update(styles)
      .set({ activeVersionId: styleVersionId })
      .where(eq(styles.id, styleId));
    await database.db.execute(
      sql.raw(`
      create function atomic_test_reject_audit() returns trigger language plpgsql as $$
      begin
        if new.request_id = 'inject-audit-failure' then
          raise exception 'injected audit failure';
        end if;
        return new;
      end $$;
      create trigger reject_atomic_audit before insert on audit_events
      for each row execute function atomic_test_reject_audit();
    `),
    );
  });

  afterAll(async () => {
    await database.db.execute(
      sql`drop trigger if exists reject_atomic_audit on audit_events`,
    );
    await database.db.execute(
      sql`drop function if exists atomic_test_reject_audit()`,
    );
    await database.db
      .delete(auditEvents)
      .where(eq(auditEvents.workspaceId, workspaceId));
    await withPurgeTransaction(database.db, (tx) =>
      tx.delete(workspaces).where(eq(workspaces.id, workspaceId)),
    );
    await database.db
      .delete(users)
      .where(inArray(users.id, [userId, invitedUserId]));
    await database.pool.end();
  });

  it("rolls a company insert back when its audit insert fails", async () => {
    const service = createCompanyService({
      repository: createCompanyRepository(database.db),
    });
    await expect(
      service.create(actor, { name: "Must roll back" }),
    ).rejects.toThrow();
    const rows = await database.db
      .select()
      .from(companies)
      .where(eq(companies.name, "Must roll back"));
    expect(rows).toHaveLength(0);
  });

  it("rolls a document projection back and restores Git when audit fails", async () => {
    const restoreCheckpoint = vi.fn().mockResolvedValue(undefined);
    const seededStyles = await database.db
      .select()
      .from(styles)
      .where(eq(styles.id, styleId));
    expect(seededStyles[0]?.activeVersionId).toBe(styleVersionId);
    const service = createDocumentService({
      repository: createDocumentRepository(database.db),
      git: {
        checkpoint: () =>
          Promise.resolve({
            workspaceId,
            companyId,
            headCommitId: null,
            release: () => undefined,
          }),
        completeCheckpoint: () => undefined,
        restoreCheckpoint,
        write: (input: WriteDocumentGitInput) =>
          Promise.resolve({
            commitId: "a".repeat(40),
            body: input.body,
            format: input.format,
            styleVersionId: input.styleVersionId,
            actor: input.actor,
          }),
      } as never,
      renderer: {} as never,
      sourceBuilder: {
        resolve: (format, body) => ({ body, source: `${format}:${body}` }),
      },
      operations: new MutationOperationJournal(database.db),
    });
    let failure: unknown;
    try {
      await service.create(
        { type: "human", ...actor },
        {
          companyId,
          styleId,
          title: "Must roll back",
          format: "markdown",
          body: "safe test body",
        },
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeDefined();
    const rows = await database.db
      .select()
      .from(documents)
      .where(eq(documents.workspaceId, workspaceId));
    expect(rows).toHaveLength(0);
    expect(restoreCheckpoint).toHaveBeenCalledOnce();
  });

  it("rolls a membership insert back when its audit insert fails", async () => {
    await expect(
      inviteMember(
        { memberships: createMembershipRepository(database.db) },
        actor,
        { email: `${invitedUserId}@example.test`, role: "member" },
      ),
    ).rejects.toThrow();
    const rows = await database.db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, invitedUserId));
    expect(rows).toHaveLength(0);
  });

  it("does not orphan a live credential when its audit insert fails", async () => {
    const service = createCredentialService({
      repository: createCredentialRepository(database.db),
      pepper: "integration-only-pepper",
    });
    await expect(
      service.create(actor, {
        name: "Must roll back",
        companyIds: [companyId],
        actions: ["documents:read"],
      }),
    ).rejects.toThrow();
    const rows = await database.db
      .select()
      .from(mcpCredentials)
      .where(eq(mcpCredentials.workspaceId, workspaceId));
    expect(rows).toHaveLength(0);
  });

  it("keeps a retryable safe state for an external partial failure", async () => {
    const journal = new MutationOperationJournal(database.db);
    const first = await journal.begin({
      workspaceId,
      idempotencyKey: "s3:test-object",
      operationType: "s3_upload",
      targetType: "stored_object",
      externalReference: "objects/safe-test-key",
    });
    const retry = await journal.begin({
      workspaceId,
      idempotencyKey: "s3:test-object",
      operationType: "s3_upload",
      targetType: "stored_object",
      externalReference: "objects/safe-test-key",
    });
    expect(retry.id).toBe(first.id);
    await journal.markExternalApplied(first.id);
    await reconcileMutationOperations(journal, {
      s3_upload: () =>
        Promise.reject(new Error("raw provider failure with private details")),
    });
    const [failed] = await database.db
      .select()
      .from(mutationOperations)
      .where(eq(mutationOperations.id, first.id));
    expect(failed).toMatchObject({
      status: "reconcile_required",
      safeErrorCode: "reconcile_failed",
      externalReference: "objects/safe-test-key",
    });
    await reconcileMutationOperations(journal, {
      s3_upload: () => Promise.resolve("completed"),
    });
    const [completed] = await database.db
      .select()
      .from(mutationOperations)
      .where(eq(mutationOperations.id, first.id));
    expect(completed?.status).toBe("completed");
  });
});
