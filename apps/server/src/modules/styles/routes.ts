import {
  CreateStyleInputSchema,
  CreateStyleVersionInputSchema,
  StyleDefinitionSchema,
} from "@hypergendoc/contracts";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import type { PreauthenticatedActor } from "../auth/request-actor.js";
import type { createStyleService } from "./service.js";

const ActivateSchema = z.object({ versionId: z.string().uuid() }).strict();
const PreviewSchema = z
  .object({
    versionId: z.string().uuid().optional(),
    definition: StyleDefinitionSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.versionId || value.definition), {
    message: "A versionId or draft definition is required",
  });
export interface StyleRouteDependencies {
  readonly actorFor: PreauthenticatedActor;
  readonly service: ReturnType<typeof createStyleService>;
}
export function createStyleRoutes(
  deps: StyleRouteDependencies,
): FastifyPluginAsync {
  return (app) => {
    app.get<{ Params: { companyId: string } }>(
      "/api/companies/:companyId/styles",
      async (request) =>
        deps.service.list(deps.actorFor(request), request.params.companyId),
    );
    app.post<{ Params: { companyId: string } }>(
      "/api/companies/:companyId/styles",
      async (request, reply) => {
        const input = CreateStyleInputSchema.parse({
          ...(request.body as object),
          companyId: request.params.companyId,
        });
        return reply
          .code(201)
          .send(await deps.service.create(deps.actorFor(request), input));
      },
    );
    app.get<{ Params: { styleId: string } }>(
      "/api/styles/:styleId",
      async (request) =>
        deps.service.get(deps.actorFor(request), request.params.styleId),
    );
    app.get<{ Params: { styleId: string } }>(
      "/api/styles/:styleId/versions",
      async (request) =>
        deps.service.history(deps.actorFor(request), request.params.styleId),
    );
    app.post<{ Params: { styleId: string } }>(
      "/api/styles/:styleId/versions",
      async (request, reply) => {
        const input = CreateStyleVersionInputSchema.parse(request.body);
        return reply
          .code(201)
          .send(
            await deps.service.createVersion(
              deps.actorFor(request),
              request.params.styleId,
              input.definition,
              input.activate,
            ),
          );
      },
    );
    app.post<{ Params: { styleId: string } }>(
      "/api/styles/:styleId/activate",
      async (request, reply) => {
        await deps.service.activate(
          deps.actorFor(request),
          request.params.styleId,
          ActivateSchema.parse(request.body).versionId,
        );
        return reply.code(204).send();
      },
    );
    app.post<{ Params: { styleId: string } }>(
      "/api/styles/:styleId/preview",
      async (request) =>
        deps.service.preview(
          deps.actorFor(request),
          request.params.styleId,
          PreviewSchema.parse(request.body),
        ),
    );
    return Promise.resolve();
  };
}
