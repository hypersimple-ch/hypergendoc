import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { WorkspaceRole } from "@hypergendoc/contracts";
import type { Database } from "@hypergendoc/db";
import {
  accounts,
  memberships,
  users,
  workspaceInvites,
  workspaces,
} from "@hypergendoc/db";
import type { AuditWriter } from "../../platform/audit.js";
import { createTransactionAuditWriter } from "../../platform/audit.js";

export interface InviteRecord {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}
export interface PendingInviteRecord extends InviteRecord {
  workspaceName: string;
}

export interface InviteOperations {
  findByTokenHash(tokenHash: string): Promise<PendingInviteRecord | undefined>;
  findPending(workspaceId: string, email: string): Promise<InviteRecord | undefined>;
  insert(input: Readonly<{
    workspaceId: string;
    email: string;
    role: WorkspaceRole;
    tokenHash: string;
    createdBy: string;
    expiresAt: Date;
  }>): Promise<InviteRecord>;
  listPending(workspaceId: string): Promise<InviteRecord[]>;
  deletePending(workspaceId: string, inviteId: string): Promise<boolean>;
  /** Any existing account blocks acceptance; emails are globally unique. */
  findUserIdByEmail(email: string): Promise<string | undefined>;
  insertUser(input: Readonly<{
    id: string;
    name: string;
    email: string;
    passwordHash: string;
  }>): Promise<void>;
  insertMembership(input: Readonly<{
    workspaceId: string;
    userId: string;
    role: WorkspaceRole;
  }>): Promise<{ id: string }>;
  markAccepted(inviteId: string, acceptedAt: Date): Promise<void>;
}
export interface InviteRepository {
  transaction<T>(
    operation: (operations: InviteOperations, audit: AuditWriter) => Promise<T>,
  ): Promise<T>;
}

export function createInviteRepository(database: Database): InviteRepository {
  const operations: InviteOperations = {
    async findByTokenHash(tokenHash) {
      const rows = await database
        .select({
          id: workspaceInvites.id,
          workspaceId: workspaceInvites.workspaceId,
          email: workspaceInvites.email,
          role: workspaceInvites.role,
          expiresAt: workspaceInvites.expiresAt,
          acceptedAt: workspaceInvites.acceptedAt,
          createdAt: workspaceInvites.createdAt,
          workspaceName: workspaces.name,
        })
        .from(workspaceInvites)
        .innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
        .where(eq(workspaceInvites.tokenHash, tokenHash))
        .limit(1);
      return rows[0];
    },
    async findPending(workspaceId, email) {
      const rows = await database
        .select()
        .from(workspaceInvites)
        .where(
          and(
            eq(workspaceInvites.workspaceId, workspaceId),
            eq(workspaceInvites.email, email),
            isNull(workspaceInvites.acceptedAt),
          ),
        )
        .limit(1);
      return rows[0];
    },
    async insert(input) {
      const rows = await database
        .insert(workspaceInvites)
        .values({
          workspaceId: input.workspaceId,
          email: input.email,
          role: input.role,
          tokenHash: input.tokenHash,
          createdBy: input.createdBy,
          expiresAt: input.expiresAt,
        })
        .returning();
      return rows[0]!;
    },
    async listPending(workspaceId) {
      return database
        .select()
        .from(workspaceInvites)
        .where(
          and(
            eq(workspaceInvites.workspaceId, workspaceId),
            isNull(workspaceInvites.acceptedAt),
          ),
        )
        .orderBy(desc(workspaceInvites.createdAt));
    },
    async deletePending(workspaceId, inviteId) {
      const rows = await database
        .delete(workspaceInvites)
        .where(
          and(
            eq(workspaceInvites.workspaceId, workspaceId),
            eq(workspaceInvites.id, inviteId),
            isNull(workspaceInvites.acceptedAt),
          ),
        )
        .returning({ id: workspaceInvites.id });
      return rows.length > 0;
    },
    async findUserIdByEmail(email) {
      const rows = await database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      return rows[0]?.id;
    },
    async insertUser(input) {
      await database.insert(users).values({
        id: input.id,
        name: input.name,
        email: input.email,
        emailVerified: true,
      });
      await database.insert(accounts).values({
        id: crypto.randomUUID(),
        accountId: input.id,
        providerId: "credential",
        userId: input.id,
        password: input.passwordHash,
      });
    },
    async insertMembership(input) {
      const rows = await database
        .insert(memberships)
        .values({
          workspaceId: input.workspaceId,
          userId: input.userId,
          role: input.role,
        })
        .returning({ id: memberships.id });
      return rows[0]!;
    },
    async markAccepted(inviteId, acceptedAt) {
      await database.execute(sql`
        UPDATE workspace_invites SET accepted_at = ${acceptedAt}
        WHERE id = ${inviteId} AND accepted_at IS NULL
      `);
    },
  };
  return {
    async transaction(operation) {
      return database.transaction(async (tx) =>
        operation(operations, createTransactionAuditWriter(tx)),
      );
    },
  };
}
