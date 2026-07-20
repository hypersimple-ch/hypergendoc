import type { FastifyInstance } from "fastify";
import type { AgentActor } from "../modules/auth/actors.js";
import type { DocumentService } from "../modules/documents/service.js";
import { AppError } from "../platform/errors.js";

export function registerMcpArtifactRoute(
  app: FastifyInstance,
  dependencies: Readonly<{
    credentials: {
      verify(token: string, requestId: string): Promise<AgentActor>;
    };
    documents: DocumentService;
  }>,
): void {
  app.get(
    "/mcp-artifacts/:documentId/:version/:kind",
    async (request, reply) => {
      const authorization = request.headers.authorization;
      const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : undefined;
      if (!token) throw new AppError("unauthenticated", 401);
      let agent: AgentActor;
      try {
        agent = await dependencies.credentials.verify(token, request.id);
      } catch {
        throw new AppError("unauthenticated", 401);
      }
      const params = request.params as {
        documentId: string;
        version: string;
        kind: string;
      };
      const version = Number(params.version);
      if (
        !Number.isSafeInteger(version) ||
        version < 1 ||
        params.kind !== "pdf"
      )
        throw new AppError("not_found", 404);
      const artifact = await dependencies.documents.artifact(
        { type: "agent", ...agent },
        params.documentId,
        version,
        params.kind,
      );
      return reply
        .header("Content-Type", artifact.contentType)
        .header("Cache-Control", "private, no-store")
        .send(Buffer.from(artifact.bytes));
    },
  );
}
