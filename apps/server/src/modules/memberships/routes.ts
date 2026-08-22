import type { WorkspaceRole } from "@hypergendoc/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { PreauthenticatedActor } from "../auth/request-actor.js";
import { z } from "zod";
import {
  changeMemberRole,
  inviteMember,
  removeMember,
  type MembershipRepository,
} from "./service.js";

const RoleSchema = z.enum(["owner", "member"] satisfies [
  WorkspaceRole,
  ...WorkspaceRole[],
]);
const InviteSchema = z
  .object({
    email: z.string().trim().email().max(320),
    role: RoleSchema,
  })
  .strict();
const ChangeRoleSchema = z.object({ role: RoleSchema }).strict();
const MemberParamsSchema = z.object({
  userId: z.string().min(1).max(128),
});

export function createMembershipRoutes(deps: {
  readonly actorFor: PreauthenticatedActor;
  readonly memberships: MembershipRepository;
}): FastifyPluginAsync {
  return (app) => {
    app.post("/api/workspaces/current/members", async (request, reply) => {
      const actor = deps.actorFor(request);
      const membership = await inviteMember(
        { memberships: deps.memberships },
        actor,
        InviteSchema.parse(request.body),
      );
      return reply.code(201).send(membership);
    });
    app.patch("/api/workspaces/current/members/:userId", async (request) => {
      const actor = deps.actorFor(request);
      const { userId } = MemberParamsSchema.parse(request.params);
      const { role } = ChangeRoleSchema.parse(request.body);
      const membership = await changeMemberRole(
        { memberships: deps.memberships },
        actor,
        userId,
        role,
      );
      return membership;
    });
    app.delete(
      "/api/workspaces/current/members/:userId",
      async (request, reply) => {
        const actor = deps.actorFor(request);
        const { userId } = MemberParamsSchema.parse(request.params);
        await removeMember({ memberships: deps.memberships }, actor, userId);
        return reply.code(204).send();
      },
    );
    return Promise.resolve();
  };
}
