import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { mutationOperations, type Database } from "@hypergendoc/db";

export type MutationOperationStatus =
  "pending" | "external_applied" | "completed" | "reconcile_required";
export interface MutationOperation {
  readonly id: string;
  readonly workspaceId: string;
  readonly idempotencyKey: string;
  readonly operationType: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly externalReference: string | null;
  readonly status: MutationOperationStatus;
  readonly attempts: number;
}
export interface BeginMutationOperation {
  readonly workspaceId: string;
  readonly idempotencyKey: string;
  readonly operationType: string;
  readonly targetType: string;
  readonly targetId?: string;
  /** An opaque object key or Git checkpoint identifier. Never a body, secret, or byte payload. */
  readonly externalReference?: string;
}

const operation = (
  row: typeof mutationOperations.$inferSelect,
): MutationOperation => ({
  id: row.id,
  workspaceId: row.workspaceId,
  idempotencyKey: row.idempotencyKey,
  operationType: row.operationType,
  targetType: row.targetType,
  targetId: row.targetId,
  externalReference: row.externalReference,
  status: row.status,
  attempts: row.attempts,
});

export class MutationOperationJournal {
  public constructor(private readonly db: Database) {}

  async begin(input: BeginMutationOperation): Promise<MutationOperation> {
    return this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(mutationOperations)
        .values(input)
        .onConflictDoNothing({
          target: [
            mutationOperations.workspaceId,
            mutationOperations.idempotencyKey,
          ],
        })
        .returning();
      if (inserted) return operation(inserted);
      const [existing] = await tx
        .select()
        .from(mutationOperations)
        .where(
          and(
            eq(mutationOperations.workspaceId, input.workspaceId),
            eq(mutationOperations.idempotencyKey, input.idempotencyKey),
          ),
        )
        .for("update");
      if (!existing) throw new Error("mutation operation disappeared");
      if (
        existing.operationType !== input.operationType ||
        existing.targetType !== input.targetType
      )
        throw new Error("mutation idempotency conflict");
      return operation(existing);
    });
  }

  async markExternalApplied(id: string): Promise<void> {
    await this.db
      .update(mutationOperations)
      .set({
        status: "external_applied",
        updatedAt: new Date(),
        safeErrorCode: null,
      })
      .where(
        and(
          eq(mutationOperations.id, id),
          inArray(mutationOperations.status, ["pending", "reconcile_required"]),
        ),
      );
  }

  async requireReconciliation(
    id: string,
    safeErrorCode: string,
  ): Promise<void> {
    if (!/^[a-z0-9_]{1,64}$/.test(safeErrorCode))
      throw new Error("unsafe error code");
    await this.db
      .update(mutationOperations)
      .set({
        status: "reconcile_required",
        attempts: sql`${mutationOperations.attempts} + 1`,
        safeErrorCode,
        updatedAt: new Date(),
      })
      .where(eq(mutationOperations.id, id));
  }

  async complete(id: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(mutationOperations)
      .set({
        status: "completed",
        completedAt: now,
        updatedAt: now,
        safeErrorCode: null,
      })
      .where(eq(mutationOperations.id, id));
  }

  async pending(limit = 50): Promise<readonly MutationOperation[]> {
    return (
      await this.db
        .select()
        .from(mutationOperations)
        .where(
          inArray(mutationOperations.status, [
            "external_applied",
            "reconcile_required",
          ]),
        )
        .orderBy(asc(mutationOperations.updatedAt))
        .limit(limit)
    ).map(operation);
  }
}

export type MutationReconcileHandler = (
  operation: MutationOperation,
) => Promise<"completed" | { retry: string }>;

/** Runs bounded recovery work. Handlers return allow-listed safe codes, never raw errors. */
export async function reconcileMutationOperations(
  journal: MutationOperationJournal,
  handlers: Readonly<Record<string, MutationReconcileHandler>>,
  limit = 50,
): Promise<number> {
  const pending = await journal.pending(limit);
  for (const item of pending) {
    const handler = handlers[item.operationType];
    if (!handler) {
      await journal.requireReconciliation(item.id, "handler_unavailable");
      continue;
    }
    try {
      const result = await handler(item);
      if (result === "completed") await journal.complete(item.id);
      else await journal.requireReconciliation(item.id, result.retry);
    } catch {
      await journal.requireReconciliation(item.id, "reconcile_failed");
    }
  }
  return pending.length;
}
