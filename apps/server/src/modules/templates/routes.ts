import {
  CreateTemplateInputSchema,
  CreateTemplateVersionInputSchema,
  RenderTemplatePreviewInputSchema,
} from "@hypergendoc/contracts";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import type { PreauthenticatedActor } from "../auth/request-actor.js";
import { listStarterTemplates, starterTemplates } from "./starter-catalog.js";
import type { createTemplateService } from "./service.js";

const ActivateSchema = z.object({ versionId: z.string().uuid() }).strict();

const PreviewStarterSchema = z
  .object({
    companyId: z.string().uuid(),
    starterId: z.enum(
      starterTemplates.map((starter) => starter.id) as [
        string,
        ...string[],
      ],
    ),
    styleVersionId: z.string().uuid(),
  })
  .strict();

const FromStarterSchema = z
  .object({
    companyId: z.string().uuid(),
    starterId: z.enum(
      starterTemplates.map((starter) => starter.id) as [
        string,
        ...string[],
      ],
    ),
    name: z.string().trim().min(1).max(120),
    styleVersionId: z.string().uuid(),
  })
  .strict();

export interface TemplateRouteDependencies {
  readonly actorFor: PreauthenticatedActor;
  readonly service: ReturnType<typeof createTemplateService>;
}

export function createTemplateRoutes(
  deps: TemplateRouteDependencies,
): FastifyPluginAsync {
  return (app) => {
    // Static server-owned catalog; the actor check keeps the auth boundary
    // consistent with every other protected API route.
    app.get("/api/starter-templates", (request) => {
      deps.actorFor(request);
      return listStarterTemplates();
    });

    // Ad-hoc draft preview of an unpersisted starter definition for
    // authenticated members; company-scoped validation happens in the service.
    app.post("/api/starter-templates/preview", async (request) => {
      const actor = deps.actorFor(request);
      const input = PreviewStarterSchema.parse(request.body);
      return deps.service.previewStarter(actor, input);
    });

    app.post("/api/templates/from-starter", async (request, reply) => {
      const input = FromStarterSchema.parse(request.body);
      return reply
        .code(201)
        .send(await deps.service.createFromStarter(deps.actorFor(request), input));
    });

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

    app.post<{ Params: { templateId: string } }>(
      "/api/templates/:templateId/duplicate",
      async (request, reply) =>
        reply
          .code(201)
          .send(
            await deps.service.duplicate(
              deps.actorFor(request),
              request.params.templateId,
            ),
          ),
    );

    return Promise.resolve();
  };
}
