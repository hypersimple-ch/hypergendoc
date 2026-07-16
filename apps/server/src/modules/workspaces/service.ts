import type { HumanActor } from "../auth/actors.js";
import { AuthorizationError } from "../memberships/service.js";

export interface WorkspaceReadRepository<Workspace, Member> {
  findWorkspace(workspaceId: string): Promise<Workspace | undefined>;
  listMembers(workspaceId: string): Promise<readonly Member[]>;
}

/** Read methods intentionally take only the trusted actor workspace. */
export function createWorkspaceReadService<Workspace, Member>(
  repository: WorkspaceReadRepository<Workspace, Member>,
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
  };
}
