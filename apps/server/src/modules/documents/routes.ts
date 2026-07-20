import { CommitShaSchema } from "@hypergendoc/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ActorContext } from "../../platform/context.js";
import { AppError } from "../../platform/errors.js";
import type { DocumentService } from "./service.js";

export interface DocumentRouteDependencies {
  readonly service: DocumentService;
  /** Authentication/CSRF wiring belongs to the application composition root. */
  readonly actorFor: (request: FastifyRequest) => ActorContext | undefined;
}

const safeSha = (value: string): string => {
  const parsed = CommitShaSchema.safeParse(value);
  if (!parsed.success) throw new AppError("not_found", 404);
  return parsed.data;
};

const safeTitle = (title: string): string =>
  title.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document";

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

  app.post("/api/documents/:documentId/source", async (request) =>
    deps.service.update(
      actor(request),
      (request.params as { documentId: string }).documentId,
      request.body,
    ),
  );

  app.get("/api/documents/:documentId/commits", async (request) =>
    deps.service.history(
      actor(request),
      (request.params as { documentId: string }).documentId,
    ),
  );

  app.get("/api/documents/:documentId/commits/:commitSha", async (request) => {
    const params = request.params as {
      documentId: string;
      commitSha: string;
    };
    return deps.service.readCommit(
      actor(request),
      params.documentId,
      safeSha(params.commitSha),
    );
  });

  app.get(
    "/api/documents/:documentId/commits/:commitSha/source",
    async (request, reply) => {
      const params = request.params as {
        documentId: string;
        commitSha: string;
      };
      const result = await deps.service.readCommit(
        actor(request),
        params.documentId,
        safeSha(params.commitSha),
      );
      const document = await deps.service.get(
        actor(request),
        params.documentId,
      );
      const extension = result.snapshot.format === "markdown" ? "md" : "html";
      return reply
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Cache-Control", "private, no-store")
        .header("X-Document-Commit", result.snapshot.commitSha)
        .header(
          "Content-Disposition",
          `attachment; filename="${safeTitle(document.title)}.${extension}"`,
        )
        .send(result.snapshot.body);
    },
  );

  app.post("/api/documents/:documentId/revert", async (request) =>
    deps.service.revert(
      actor(request),
      (request.params as { documentId: string }).documentId,
      request.body,
    ),
  );

  app.get("/api/documents/:documentId/pdf", async (request, reply) => {
    const documentId = (request.params as { documentId: string }).documentId;
    const query = request.query as { disposition?: string };
    if (
      query.disposition !== undefined &&
      query.disposition !== "inline" &&
      query.disposition !== "attachment"
    )
      throw new AppError("validation_failed", 400);
    const result = await deps.service.pdf(actor(request), documentId);
    const disposition =
      query.disposition === "inline" ? "inline" : "attachment";
    return reply
      .header("Content-Type", result.contentType)
      .header("Cache-Control", "private, no-store")
      .header("X-Document-Commit", result.commitSha)
      .header(
        "Content-Disposition",
        `${disposition}; filename="document-${result.commitSha.slice(0, 12)}.pdf"`,
      )
      .send(Buffer.from(result.bytes));
  });
}

export function createDocumentRouteRegistrar(
  deps: DocumentRouteDependencies,
): (app: FastifyInstance) => void {
  return (app) => registerDocumentRoutes(app, deps);
}
