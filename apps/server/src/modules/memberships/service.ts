import type { WorkspaceRole } from "@hypergendoc/contracts";
import type { HumanActor } from "../auth/actors.js";

export class AuthorizationError extends Error {
  public constructor(
    public readonly code: "forbidden" | "not_found" | "conflict",
  ) {
    super(code);
  }
}

export interface MembershipRecord {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}
export interface MembershipRepository {
  /** Every lookup is tenant scoped so foreign IDs remain indistinguishable from absent IDs. */
  findMembership(
    workspaceId: string,
    userId: string,
  ): Promise<MembershipRecord | undefined>;
  /** The MVP permits one agency workspace per person, including invitations. */
  findAnyMembership(userId: string): Promise<MembershipRecord | undefined>;
  findUserIdByVerifiedEmail(email: string): Promise<string | undefined>;
  insertMembership(
    input: Readonly<{
      workspaceId: string;
      userId: string;
      role: WorkspaceRole;
    }>,
  ): Promise<MembershipRecord>;
  updateRole(
    input: Readonly<{
      workspaceId: string;
      userId: string;
      role: WorkspaceRole;
    }>,
  ): Promise<MembershipRecord | undefined>;
  deleteMembership(workspaceId: string, userId: string): Promise<boolean>;
  countOwners(workspaceId: string): Promise<number>;
  /** Must execute callback against transaction-bound operations with owner row locks. */
  transaction<T>(
    operation: (repository: MembershipOperations) => Promise<T>,
  ): Promise<T>;
}
export type MembershipOperations = Omit<MembershipRepository, "transaction">;

export interface WorkspaceRepository {
  transaction<T>(
    operation: (repository: WorkspaceOperations) => Promise<T>,
  ): Promise<T>;
  createWorkspace(input: Readonly<{ name: string }>): Promise<{ id: string }>;
  hasMembership(userId: string): Promise<boolean>;
  insertOwnerMembership(
    input: Readonly<{ workspaceId: string; userId: string }>,
  ): Promise<void>;
}
export type WorkspaceOperations = Omit<WorkspaceRepository, "transaction">;

export function requireOwner(actor: HumanActor): void {
  if (actor.role !== "owner") throw new AuthorizationError("forbidden");
}

/** Creates the initial workspace and owner membership atomically after verified registration. */
export async function createInitialWorkspace(
  deps: { workspaces: WorkspaceRepository },
  input: Readonly<{ userId: string; verified: boolean; name: string }>,
): Promise<{ id: string }> {
  if (!input.verified) throw new AuthorizationError("forbidden");
  return deps.workspaces.transaction(async (workspaces) => {
    if (await workspaces.hasMembership(input.userId))
      throw new AuthorizationError("conflict");
    const workspace = await workspaces.createWorkspace({
      name: input.name,
    });
    await workspaces.insertOwnerMembership({
      workspaceId: workspace.id,
      userId: input.userId,
    });
    return workspace;
  });
}

export async function inviteMember(
  deps: { memberships: MembershipRepository },
  actor: HumanActor,
  input: Readonly<{ email: string; role: WorkspaceRole }>,
): Promise<MembershipRecord> {
  requireOwner(actor);
  return deps.memberships.transaction(async (memberships) => {
    const userId = await memberships.findUserIdByVerifiedEmail(input.email);
    if (!userId) throw new AuthorizationError("not_found");
    const existing = await memberships.findAnyMembership(userId);
    if (existing) throw new AuthorizationError("conflict");
    return memberships.insertMembership({
      workspaceId: actor.workspaceId,
      userId,
      role: input.role,
    });
  });
}

export async function changeMemberRole(
  deps: { memberships: MembershipRepository },
  actor: HumanActor,
  userId: string,
  role: WorkspaceRole,
): Promise<MembershipRecord> {
  requireOwner(actor);
  return deps.memberships.transaction(async (memberships) => {
    const current = await memberships.findMembership(actor.workspaceId, userId);
    if (!current) throw new AuthorizationError("not_found");
    if (
      current.role === "owner" &&
      role !== "owner" &&
      (await memberships.countOwners(actor.workspaceId)) <= 1
    )
      throw new AuthorizationError("conflict");
    const updated = await memberships.updateRole({
      workspaceId: actor.workspaceId,
      userId,
      role,
    });
    if (!updated) throw new AuthorizationError("not_found");
    return updated;
  });
}

export async function removeMember(
  deps: { memberships: MembershipRepository },
  actor: HumanActor,
  userId: string,
): Promise<void> {
  requireOwner(actor);
  await deps.memberships.transaction(async (memberships) => {
    const current = await memberships.findMembership(actor.workspaceId, userId);
    if (!current) throw new AuthorizationError("not_found");
    if (
      current.role === "owner" &&
      (await memberships.countOwners(actor.workspaceId)) <= 1
    )
      throw new AuthorizationError("conflict");
    if (!(await memberships.deleteMembership(actor.workspaceId, userId)))
      throw new AuthorizationError("not_found");
  });
}
