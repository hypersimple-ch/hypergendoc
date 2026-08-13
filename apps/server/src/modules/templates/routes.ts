import {
  CreateTemplateInputSchema,
  CreateTemplateVersionInputSchema,
  RenderTemplatePreviewInputSchema,
} from "@hypergendoc/contracts";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import type { HumanActor } from "../auth/actors.js";
import type { createTemplateService } from "./service.js";

const ActivateSchema = z.object({ versionId: z.string().uuid() }).strict();

export interface TemplateRouteDependencies {
  readonly authenticate: (request: {
    readonly id: string;
  }) => Promise<HumanActor>;
  readonly service: ReturnType<typeof createTemplateService>;
}

export function createTemplateRoutes(
  deps: TemplateRouteDependencies,
): FastifyPluginAsync {
  return (app) => {
    app.get<{ Params: { companyId: string } }>(
      "/api/companies/:companyId/templates",
      async (request) =>
        deps.service.list(
          await deps.authenticate(request),
          request.params.companyId,
        ),
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
          .send(
            await deps.service.create(await deps.authenticate(request), input),
          );
      },
    );

    app.get<{ Params: { templateId: string } }>(
      "/api/templates/:templateId",
      async (request) =>
        deps.service.get(
          await deps.authenticate(request),
          request.params.templateId,
        ),
    );

    app.get<{ Params: { templateId: string } }>(
      "/api/templates/:templateId/versions",
      async (request) =>
        deps.service.history(
          await deps.authenticate(request),
          request.params.templateId,
        ),
    );

    app.post<{ Params: { templateId: string } }>(
      "/api/templates/:templateId/versions",
      async (request, reply) => {
        const input = CreateTemplateVersionInputSchema.parse(request.body);
        return reply
          .code(201)
          .send(
            await deps.service.createVersion(
              await deps.authenticate(request),
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
          await deps.authenticate(request),
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
          await deps.authenticate(request),
          request.params.templateId,
          RenderTemplatePreviewInputSchema.parse(request.body),
        ),
    );

    return Promise.resolve();
  };
}
