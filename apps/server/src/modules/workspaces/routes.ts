import type { FastifyPluginAsync } from "fastify";
import type { HumanActor } from "../auth/actors.js";
import type { createWorkspaceReadService } from "./service.js";

export interface WorkspaceRouteDependencies<Workspace, Member> {
  readonly authenticate: (request: {
    readonly id: string;
  }) => Promise<HumanActor>;
  readonly service: ReturnType<
    typeof createWorkspaceReadService<Workspace, Member>
  >;
}
export function createWorkspaceReadRoutes<Workspace, Member>(
  deps: WorkspaceRouteDependencies<Workspace, Member>,
): FastifyPluginAsync {
  return (app) => {
    app.get("/api/workspaces/current", async (request) =>
      deps.service.current(await deps.authenticate(request)),
    );
    app.get("/api/workspaces/current/members", async (request) =>
      deps.service.members(await deps.authenticate(request)),
    );
    return Promise.resolve();
  };
}
