import {
  CreateMcpCredentialInputSchema,
  UpdateMcpCredentialInputSchema,
} from "@hypergendoc/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { PreauthenticatedActor } from "../auth/request-actor.js";
import type { createCredentialService } from "./service.js";

export interface CredentialRouteDependencies {
  readonly actorFor: PreauthenticatedActor;
  readonly service: ReturnType<typeof createCredentialService>;
}
export function createCredentialRoutes(
  deps: CredentialRouteDependencies,
): FastifyPluginAsync {
  return (app) => {
    app.get("/api/mcp-credentials", async (request) =>
      deps.service.list(deps.actorFor(request)),
    );
    app.post("/api/mcp-credentials", async (request, reply) =>
      reply
        .code(201)
        .send(
          await deps.service.create(
            deps.actorFor(request),
            CreateMcpCredentialInputSchema.parse(request.body),
          ),
        ),
    );
    app.patch<{ Params: { credentialId: string } }>(
      "/api/mcp-credentials/:credentialId",
      async (request) => {
        const input = UpdateMcpCredentialInputSchema.parse(request.body);
        return deps.service.replaceScopes(
          deps.actorFor(request),
          request.params.credentialId,
          {
            ...input,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          },
        );
      },
    );
    app.delete<{ Params: { credentialId: string } }>(
      "/api/mcp-credentials/:credentialId",
      async (request, reply) => {
        await deps.service.revoke(
          deps.actorFor(request),
          request.params.credentialId,
        );
        return reply.code(204).send();
      },
    );
    return Promise.resolve();
  };
}
