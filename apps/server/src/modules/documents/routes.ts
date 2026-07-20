import type { ActorContext } from "../../platform/context.js";
import { AppError } from "../../platform/errors.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DocumentService } from "./service.js";

export interface DocumentRouteDependencies {
  readonly service: DocumentService;
  /** Authentication/CSRF wiring belongs to the application composition root. */
  readonly actorFor: (request: FastifyRequest) => ActorContext | undefined;
}

/** Registers only document HTTP endpoints; callers own authentication and root wiring. */
export function registerDocumentRoutes(
  app: FastifyInstance,
  deps: DocumentRouteDependencies,
): void {
  const actor = (request: FastifyRequest) => deps.actorFor(request);
  app.get("/api/documents", async (request) => {
    const query = request.query as { companyId?: string };
    return deps.service.list(actor(request), query.companyId);
  });
  app.post("/api/documents", async (request) =>
    deps.service.create(actor(request), request.body),
  );
  app.get("/api/documents/:documentId", async (request) =>
    deps.service.detail(
      actor(request),
      (request.params as { documentId: string }).documentId,
    ),
  );
  app.post("/api/documents/:documentId/versions", async (request) =>
    deps.service.createVersion(
      actor(request),
      (request.params as { documentId: string }).documentId,
      request.body,
    ),
  );
  app.get("/api/documents/:documentId/versions/:version", async (request) => {
    const params = request.params as { documentId: string; version: string };
    const version = Number(params.version);
    if (!Number.isSafeInteger(version) || version < 1)
      throw new AppError("validation_failed", 400);
    return deps.service.getVersion(actor(request), params.documentId, version);
  });
  app.get(
    "/api/documents/:documentId/versions/:version/input",
    async (request, reply) => {
      const params = request.params as { documentId: string; version: string };
      const version = Number(params.version);
      if (!Number.isSafeInteger(version) || version < 1)
        throw new AppError("not_found", 404);
      const input = await deps.service.input(
        actor(request),
        params.documentId,
        version,
      );
      const title =
        input.title.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") ||
        "document";
      const extension = input.format === "markdown" ? "md" : "html";
      return reply
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Cache-Control", "private, no-store")
        .header(
          "Content-Disposition",
          `attachment; filename="${title}.${extension}"`,
        )
        .send(input.body);
    },
  );
  app.get(
    "/api/documents/:documentId/versions/:version/:kind",
    async (request, reply) => {
      const params = request.params as {
        documentId: string;
        version: string;
        kind: string;
      };
      if (params.kind !== "pdf") throw new AppError("not_found", 404);
      const query = request.query as { disposition?: string };
      if (
        query.disposition !== undefined &&
        (params.kind !== "pdf" || query.disposition !== "inline")
      )
        throw new AppError("validation_failed", 400);
      const version = Number(params.version);
      if (!Number.isSafeInteger(version) || version < 1)
        throw new AppError("not_found", 404);
      const artifact = await deps.service.artifact(
        actor(request),
        params.documentId,
        version,
        params.kind,
      );
      const extension = "pdf";
      const disposition =
        query.disposition === "inline" ? "inline" : "attachment";
      return reply
        .header("Content-Type", artifact.contentType)
        .header("Cache-Control", "private, no-store")
        .header(
          "Content-Disposition",
          `${disposition}; filename="document-${version}.${extension}"`,
        )
        .send(Buffer.from(artifact.bytes));
    },
  );
}

export function createDocumentRouteRegistrar(
  deps: DocumentRouteDependencies,
): (app: FastifyInstance) => void {
  return (app) => registerDocumentRoutes(app, deps);
}
