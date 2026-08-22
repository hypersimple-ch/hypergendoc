import {
  CreateTemplateInputSchema,
  CreateTemplateVersionInputSchema,
  RenderTemplatePreviewInputSchema,
} from "@hypergendoc/contracts";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import type { PreauthenticatedActor } from "../auth/request-actor.js";
import type { createTemplateService } from "./service.js";

const ActivateSchema = z.object({ versionId: z.string().uuid() }).strict();

export interface TemplateRouteDependencies {
  readonly actorFor: PreauthenticatedActor;
  readonly service: ReturnType<typeof createTemplateService>;
}

export function createTemplateRoutes(
  deps: TemplateRouteDependencies,
): FastifyPluginAsync {
  return (app) => {
    app.get<{ Params: { companyId: string } }>(
      "/api/companies/:companyId/templates",
      async (request) =>
        deps.service.list(deps.actorFor(request), request.params.companyId),
    );

    app.post<{ Params: { companyId: string } }>(
      "/api/companies/:companyId/templates",
      async (request, reply) => {
        const input = CreateTemplateInputSchema.parse({
          ...(request.body as object),
          companyId: request.params.companyId,
        });
        return reply
          .code(201)
          .send(await deps.service.create(deps.actorFor(request), input));
      },
    );

    app.get<{ Params: { templateId: string } }>(
      "/api/templates/:templateId",
      async (request) =>
        deps.service.get(deps.actorFor(request), request.params.templateId),
    );

    app.get<{ Params: { templateId: string } }>(
      "/api/templates/:templateId/versions",
      async (request) =>
        deps.service.history(deps.actorFor(request), request.params.templateId),
    );

    app.post<{ Params: { templateId: string } }>(
      "/api/templates/:templateId/versions",
      async (request, reply) => {
        const input = CreateTemplateVersionInputSchema.parse(request.body);
        return reply
          .code(201)
          .send(
            await deps.service.createVersion(
              deps.actorFor(request),
              request.params.templateId,
              input.definition,
              input.activate,
            ),
          );
      },
    );

    app.post<{ Params: { templateId: string } }>(
      "/api/templates/:templateId/activate",
      async (request, reply) => {
        await deps.service.activate(
          deps.actorFor(request),
          request.params.templateId,
          ActivateSchema.parse(request.body).versionId,
        );
        return reply.code(204).send();
      },
    );

    app.post<{ Params: { templateId: string } }>(
      "/api/templates/:templateId/preview",
      async (request) =>
        deps.service.preview(
          deps.actorFor(request),
          request.params.templateId,
          RenderTemplatePreviewInputSchema.parse(request.body),
        ),
    );

    return Promise.resolve();
  };
}
