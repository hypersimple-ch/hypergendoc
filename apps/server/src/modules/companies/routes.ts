import {
  CreateCompanyInputSchema,
  RestoreCompanyInputSchema,
  UpdateCompanyInputSchema,
} from "@hypergendoc/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { PreauthenticatedActor } from "../auth/request-actor.js";
import type { createCompanyService } from "./service.js";

export interface CompanyRouteDependencies {
  readonly actorFor: PreauthenticatedActor;
  readonly service: ReturnType<typeof createCompanyService>;
}
/** Transport-only plugin; composition supplies session authentication and safe error handling. */
export function createCompanyRoutes(
  deps: CompanyRouteDependencies,
): FastifyPluginAsync {
  return (app) => {
    app.get("/api/companies", async (request) =>
      deps.service.list(deps.actorFor(request)),
    );
    app.post("/api/companies", async (request, reply) =>
      reply
        .code(201)
        .send(
          await deps.service.create(
            deps.actorFor(request),
            CreateCompanyInputSchema.parse(request.body),
          ),
        ),
    );
    app.get<{ Params: { companyId: string } }>(
      "/api/companies/:companyId",
      async (request) =>
        deps.service.get(deps.actorFor(request), request.params.companyId),
    );
    app.patch<{ Params: { companyId: string } }>(
      "/api/companies/:companyId",
      async (request) =>
        deps.service.update(
          deps.actorFor(request),
          request.params.companyId,
          UpdateCompanyInputSchema.parse(request.body),
        ),
    );
    app.post<{ Params: { companyId: string } }>(
      "/api/companies/:companyId/restore",
      async (request) => {
        RestoreCompanyInputSchema.parse(request.body ?? {});
        return deps.service.restore(
          deps.actorFor(request),
          request.params.companyId,
        );
      },
    );
    app.delete<{ Params: { companyId: string } }>(
      "/api/companies/:companyId",
      async (request, reply) => {
        await deps.service.archive(
          deps.actorFor(request),
          request.params.companyId,
        );
        return reply.code(204).send();
      },
    );
    return Promise.resolve();
  };
}
