import type { WorkspaceRole } from "@hypergendoc/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AuditWriter } from "../../platform/audit.js";
import type { HumanActor } from "../auth/actors.js";
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
  readonly authenticate: (request: {
    readonly id: string;
  }) => Promise<HumanActor>;
  readonly memberships: MembershipRepository;
  readonly audit: AuditWriter;
}): FastifyPluginAsync {
  return (app) => {
    app.post("/api/workspaces/current/members", async (request, reply) => {
      const actor = await deps.authenticate(request);
      const membership = await inviteMember(
        { memberships: deps.memberships },
        actor,
        InviteSchema.parse(request.body),
      );
      await deps.audit.write({
        workspaceId: actor.workspaceId,
        requestId: actor.requestId,
        event: "membership.added",
        actorType: "user",
        actorId: actor.userId,
        targetType: "membership",
        targetId: membership.id,
        outcome: "success",
        metadata: { role: membership.role },
      });
      return reply.code(201).send(membership);
    });
    app.patch("/api/workspaces/current/members/:userId", async (request) => {
      const actor = await deps.authenticate(request);
      const { userId } = MemberParamsSchema.parse(request.params);
      const { role } = ChangeRoleSchema.parse(request.body);
      const membership = await changeMemberRole(
        { memberships: deps.memberships },
        actor,
        userId,
        role,
      );
      await deps.audit.write({
        workspaceId: actor.workspaceId,
        requestId: actor.requestId,
        event: "membership.role_changed",
        actorType: "user",
        actorId: actor.userId,
        targetType: "membership",
        targetId: membership.id,
        outcome: "success",
        metadata: { role },
      });
      return membership;
    });
    app.delete(
      "/api/workspaces/current/members/:userId",
      async (request, reply) => {
        const actor = await deps.authenticate(request);
        const { userId } = MemberParamsSchema.parse(request.params);
        await removeMember({ memberships: deps.memberships }, actor, userId);
        await deps.audit.write({
          workspaceId: actor.workspaceId,
          requestId: actor.requestId,
          event: "membership.removed",
          actorType: "user",
          actorId: actor.userId,
          targetType: "user",
          targetId: userId,
          outcome: "success",
        });
        return reply.code(204).send();
      },
    );
    return Promise.resolve();
  };
}
