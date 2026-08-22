import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditEvents,
  companies,
  createDatabase,
  mcpCredentials,
  mutationOperations,
  users,
  workspaces,
} from "@hypergendoc/db";
import type { HumanActor } from "./auth/actors.js";
import { createCompanyRepository } from "./companies/repository.js";
import { createCompanyService } from "./companies/service.js";
import { createCredentialRepository } from "./credentials/repository.js";
import { createCredentialService } from "./credentials/service.js";
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
    await database.db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await database.db.delete(users).where(eq(users.id, userId));
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
