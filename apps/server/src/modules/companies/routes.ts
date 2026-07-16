import {
  CreateCompanyInputSchema,
  UpdateCompanyInputSchema,
} from "@hypergendoc/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { HumanActor } from "../auth/actors.js";
import type { createCompanyService } from "./service.js";

export interface CompanyRouteDependencies {
  readonly authenticate: (request: {
    readonly id: string;
  }) => Promise<HumanActor>;
  readonly service: ReturnType<typeof createCompanyService>;
}
/** Transport-only plugin; composition supplies session authentication and safe error handling. */
export function createCompanyRoutes(
  deps: CompanyRouteDependencies,
): FastifyPluginAsync {
  return (app) => {
    app.get("/api/companies", async (request) =>
      deps.service.list(await deps.authenticate(request)),
    );
    app.post("/api/companies", async (request, reply) =>
      reply
        .code(201)
        .send(
          await deps.service.create(
            await deps.authenticate(request),
            CreateCompanyInputSchema.parse(request.body),
          ),
        ),
    );
    app.get<{ Params: { companyId: string } }>(
      "/api/companies/:companyId",
      async (request) =>
        deps.service.get(
          await deps.authenticate(request),
          request.params.companyId,
        ),
    );
    app.patch<{ Params: { companyId: string } }>(
      "/api/companies/:companyId",
      async (request) =>
        deps.service.update(
          await deps.authenticate(request),
          request.params.companyId,
          UpdateCompanyInputSchema.parse(request.body),
        ),
    );
    app.delete<{ Params: { companyId: string } }>(
      "/api/companies/:companyId",
      async (request, reply) => {
        await deps.service.archive(
          await deps.authenticate(request),
          request.params.companyId,
        );
        return reply.code(204).send();
      },
    );
    return Promise.resolve();
  };
}
