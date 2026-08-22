import type { FastifyPluginAsync } from "fastify";
import type { PreauthenticatedActor } from "../auth/request-actor.js";
import { uploadValidationError } from "../../platform/errors.js";
import type { createCompanyAssetService } from "./assets.js";

export interface CompanyAssetRouteDependencies {
  readonly actorFor: PreauthenticatedActor;
  readonly service: ReturnType<typeof createCompanyAssetService>;
}

async function uploadedFile(
  request: unknown,
): Promise<Readonly<{ bytes?: Buffer; truncated: boolean }>> {
  const multipart = request as {
    file(): Promise<
      { file: AsyncIterable<Buffer> & { truncated?: boolean } } | undefined
    >;
  };
  const upload = await multipart.file();
  if (!upload) return { truncated: false };
  const chunks: Buffer[] = [];
  for await (const chunk of upload.file) chunks.push(Buffer.from(chunk));
  return {
    bytes: Buffer.concat(chunks),
    truncated: Boolean(upload.file.truncated),
  };
}

/** Composition must register multipart parsing with bounded file size before this plugin. */
export function createCompanyAssetRoutes(
  deps: CompanyAssetRouteDependencies,
): FastifyPluginAsync {
  return (app) => {
    app.get<{ Params: { companyId: string } }>(
      "/api/companies/:companyId/assets",
      async (request) =>
        deps.service.list(deps.actorFor(request), request.params.companyId),
    );
    app.post<{ Params: { companyId: string } }>(
      "/api/companies/:companyId/assets/fonts",
      async (request, reply) => {
        const upload = await uploadedFile(request);
        if (!upload.bytes)
          throw uploadValidationError("Choose one file to upload.");
        if (upload.truncated)
          throw uploadValidationError(
            "Choose a file smaller than 10 MiB.",
            413,
          );
        return reply
          .code(201)
          .send(
            await deps.service.uploadFont(
              deps.actorFor(request),
              request.params.companyId,
              upload.bytes,
            ),
          );
      },
    );
    app.post<{ Params: { companyId: string } }>(
      "/api/companies/:companyId/assets/images",
      async (request, reply) => {
        const upload = await uploadedFile(request);
        if (!upload.bytes)
          throw uploadValidationError("Choose one file to upload.");
        if (upload.truncated)
          throw uploadValidationError(
            "Choose a file smaller than 10 MiB.",
            413,
          );
        return reply
          .code(201)
          .send(
            await deps.service.uploadImage(
              deps.actorFor(request),
              request.params.companyId,
              upload.bytes,
            ),
          );
      },
    );
    for (const kind of ["logo", "font", "image"] as const) {
      app.get<{ Params: { companyId: string; objectId: string } }>(
        `/api/companies/:companyId/assets/${kind}s/:objectId/content`,
        async (request, reply) => {
          const content = await deps.service.content(
            deps.actorFor(request),
            request.params.companyId,
            kind,
            request.params.objectId,
          );
          return reply
            .type(content.contentType)
            .send(Buffer.from(content.bytes));
        },
      );
    }
    return Promise.resolve();
  };
}
