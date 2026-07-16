import {
  CreateMcpCredentialInputSchema,
  McpActionSchema,
} from "@hypergendoc/contracts";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import type { HumanActor } from "../auth/actors.js";
import type { createCredentialService } from "./service.js";

const ScopeUpdateSchema = z
  .object({
    companyIds: z.array(z.string().uuid()).min(1).max(100),
    actions: z.array(McpActionSchema).min(1).max(4),
    expiresAt: z.string().datetime().nullable(),
  })
  .strict();
export interface CredentialRouteDependencies {
  readonly authenticate: (request: {
    readonly id: string;
  }) => Promise<HumanActor>;
  readonly service: ReturnType<typeof createCredentialService>;
}
export function createCredentialRoutes(
  deps: CredentialRouteDependencies,
): FastifyPluginAsync {
  return (app) => {
    app.get("/api/mcp-credentials", async (request) =>
      deps.service.list(await deps.authenticate(request)),
    );
    app.post("/api/mcp-credentials", async (request, reply) =>
      reply
        .code(201)
        .send(
          await deps.service.create(
            await deps.authenticate(request),
            CreateMcpCredentialInputSchema.parse(request.body),
          ),
        ),
    );
    app.patch<{ Params: { credentialId: string } }>(
      "/api/mcp-credentials/:credentialId",
      async (request) => {
        const input = ScopeUpdateSchema.parse(request.body);
        return deps.service.replaceScopes(
          await deps.authenticate(request),
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
          await deps.authenticate(request),
          request.params.credentialId,
        );
        return reply.code(204).send();
      },
    );
    return Promise.resolve();
  };
}
