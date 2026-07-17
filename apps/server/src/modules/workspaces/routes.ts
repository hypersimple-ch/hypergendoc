import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { HumanActor } from "../auth/actors.js";
import type { createWorkspaceReadService } from "./service.js";

const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export interface WorkspaceRouteDependencies<Workspace, Member, AuditEvent> {
  readonly authenticate: (request: {
    readonly id: string;
  }) => Promise<HumanActor>;
  readonly service: ReturnType<
    typeof createWorkspaceReadService<Workspace, Member, AuditEvent>
  >;
}
export function createWorkspaceReadRoutes<
  Workspace extends object,
  Member,
  AuditEvent,
>(
  deps: WorkspaceRouteDependencies<Workspace, Member, AuditEvent>,
): FastifyPluginAsync {
  return (app) => {
    app.get("/api/workspaces/current", async (request) => {
      const actor = await deps.authenticate(request);
      return {
        ...(await deps.service.current(actor)),
        membership: {
          id: actor.membershipId,
          userId: actor.userId,
          role: actor.role,
        },
      };
    });
    app.get("/api/workspaces/current/members", async (request) =>
      deps.service.members(await deps.authenticate(request)),
    );
    app.get("/api/workspaces/current/audit", async (request) => {
      const actor = await deps.authenticate(request);
      const query = AuditQuerySchema.parse(request.query);
      return deps.service.audit(actor, query.limit, query.offset);
    });
    return Promise.resolve();
  };
}
