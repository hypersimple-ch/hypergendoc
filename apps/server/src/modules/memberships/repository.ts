import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@hypergendoc/db";
import { auditEvents, memberships, users, workspaces } from "@hypergendoc/db";
import type { WorkspaceRole } from "@hypergendoc/contracts";
import type { AuditEventRepository } from "../../platform/audit.js";
import type {
  MembershipOperations,
  MembershipRecord,
  MembershipRepository,
  WorkspaceOperations,
  WorkspaceRepository,
} from "./service.js";

type Db = Database;
const membership = (
  row: typeof memberships.$inferSelect,
): MembershipRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  userId: row.userId,
  role: row.role,
});

function membershipOperations(db: Db): MembershipOperations {
  return {
    async findMembership(workspaceId, userId) {
      const [row] = await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.userId, userId),
          ),
        );
      return row && membership(row);
    },
    async findAnyMembership(userId) {
      const [row] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, userId))
        .limit(1);
      return row && membership(row);
    },
    async findUserIdByVerifiedEmail(email) {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), eq(users.emailVerified, true)));
      return row?.id;
    },
    async insertMembership(input) {
      const [row] = await db.insert(memberships).values(input).returning();
      if (!row) throw new Error("membership insert did not return a row");
      return membership(row);
    },
    async updateRole(input) {
      const [row] = await db
        .update(memberships)
        .set({ role: input.role })
        .where(
          and(
            eq(memberships.workspaceId, input.workspaceId),
            eq(memberships.userId, input.userId),
          ),
        )
        .returning();
      return row && membership(row);
    },
    async deleteMembership(workspaceId, userId) {
      const rows = await db
        .delete(memberships)
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .returning({ id: memberships.id });
      return rows.length === 1;
    },
    async countOwners(workspaceId) {
      // Serialize owner mutations per workspace; this prevents two final-owner checks racing.
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtext(${workspaceId}))`,
      );
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.role, "owner" as WorkspaceRole),
          ),
        );
      return row?.count ?? 0;
    },
  };
}

export function createMembershipRepository(db: Database): MembershipRepository {
  const operations = membershipOperations(db);
  return {
    ...operations,
    transaction: (operation) =>
      db.transaction((tx) => operation(membershipOperations(tx as Db))),
  };
}

function workspaceOperations(db: Db): WorkspaceOperations {
  return {
    async hasMembership(userId) {
      // Serialize first-workspace creation for one user so two concurrent requests
      // cannot create ambiguous sessions.
      await db.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      const [row] = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(eq(memberships.userId, userId))
        .limit(1);
      return row !== undefined;
    },
    async createWorkspace(input) {
      const [workspace] = await db
        .insert(workspaces)
        .values(input)
        .returning({ id: workspaces.id });
      if (!workspace) throw new Error("workspace insert did not return a row");
      return workspace;
    },
    async insertOwnerMembership(input) {
      await db.insert(memberships).values({ ...input, role: "owner" });
    },
  };
}

export function createWorkspaceRepository(db: Database): WorkspaceRepository {
  const operations = workspaceOperations(db);
  return {
    ...operations,
    transaction: (operation) =>
      db.transaction((tx) => operation(workspaceOperations(tx as Db))),
  };
}

/** Appends audit events; schema triggers prohibit subsequent rewrites. */
export function createAuditEventRepository(db: Database): AuditEventRepository {
  return {
    async insert(event) {
      await db.insert(auditEvents).values({
        workspaceId: event.workspaceId,
        actorType: event.actorType,
        actorId: event.actorId,
        action: event.event,
        targetType: event.targetType,
        targetId: event.targetId,
        requestId: event.requestId,
        outcome: event.outcome,
        metadata: event.metadata ?? {},
      });
    },
  };
}

/** Workspace reads use only the trusted workspace ID supplied by the service. */
export function createWorkspaceReadRepository(db: Database) {
  return {
    async findWorkspace(workspaceId: string) {
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId));
      return workspace;
    },
    async listMembers(workspaceId: string) {
      return db
        .select({
          id: memberships.id,
          userId: memberships.userId,
          role: memberships.role,
          email: users.email,
          name: users.name,
        })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(eq(memberships.workspaceId, workspaceId));
    },
  };
}
