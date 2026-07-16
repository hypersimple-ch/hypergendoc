import type { WorkspaceRole } from "@hypergendoc/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { HumanActor } from "../auth/actors.js";
import { inviteMember, type MembershipRepository } from "./service.js";

const InviteSchema = z
  .object({
    email: z.string().trim().email().max(320),
    role: z.enum(["owner", "member"] satisfies [
      WorkspaceRole,
      ...WorkspaceRole[],
    ]),
  })
  .strict();

/** MVP membership endpoint: it adds an already verified registered user; it never creates invitation tokens. */
export function createMembershipRoutes(deps: {
  readonly authenticate: (request: {
    readonly id: string;
  }) => Promise<HumanActor>;
  readonly memberships: MembershipRepository;
}): FastifyPluginAsync {
  return (app) => {
    app.post("/api/workspaces/current/members", async (request, reply) =>
      reply
        .code(201)
        .send(
          await inviteMember(
            { memberships: deps.memberships },
            await deps.authenticate(request),
            InviteSchema.parse(request.body),
          ),
        ),
    );
    return Promise.resolve();
  };
}
