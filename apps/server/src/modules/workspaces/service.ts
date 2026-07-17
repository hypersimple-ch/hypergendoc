import type { HumanActor } from "../auth/actors.js";
import { AuthorizationError, requireOwner } from "../memberships/service.js";

export interface WorkspaceReadRepository<Workspace, Member, AuditEvent> {
  findWorkspace(workspaceId: string): Promise<Workspace | undefined>;
  listMembers(workspaceId: string): Promise<readonly Member[]>;
  listAuditEvents(
    workspaceId: string,
    limit: number,
    offset: number,
  ): Promise<readonly AuditEvent[]>;
}

/** Read methods intentionally take only the trusted actor workspace. */
export function createWorkspaceReadService<Workspace, Member, AuditEvent>(
  repository: WorkspaceReadRepository<Workspace, Member, AuditEvent>,
) {
  return {
    async current(actor: HumanActor): Promise<Workspace> {
      const workspace = await repository.findWorkspace(actor.workspaceId);
      if (!workspace) throw new AuthorizationError("not_found");
      return workspace;
    },
    async members(actor: HumanActor): Promise<readonly Member[]> {
      await this.current(actor);
      return repository.listMembers(actor.workspaceId);
    },
    async audit(actor: HumanActor, limit: number, offset: number) {
      requireOwner(actor);
      await this.current(actor);
      const events = await repository.listAuditEvents(
        actor.workspaceId,
        limit + 1,
        offset,
      );
      const hasMore = events.length > limit;
      return {
        items: events.slice(0, limit),
        ...(hasMore ? { nextOffset: offset + limit } : {}),
      };
    },
  };
}
