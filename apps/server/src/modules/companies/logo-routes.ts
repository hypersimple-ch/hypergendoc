import type { FastifyPluginAsync } from "fastify";
import { uploadValidationError } from "../../platform/errors.js";
import type { HumanActor } from "../auth/actors.js";
import type { createCompanyLogoService } from "./logo.js";

export interface CompanyLogoRouteDependencies {
  readonly authenticate: (request: {
    readonly id: string;
  }) => Promise<HumanActor>;
  readonly service: ReturnType<typeof createCompanyLogoService>;
}
/** Composition must register multipart parsing with a bounded file size before this plugin. */
export function createCompanyLogoRoutes(
  deps: CompanyLogoRouteDependencies,
): FastifyPluginAsync {
  return (app) => {
    app.post<{ Params: { companyId: string } }>(
      "/api/companies/:companyId/logo",
      async (request, reply) => {
        const multipart = request as typeof request & {
          file(): Promise<
            | {
                file: AsyncIterable<Buffer> & { truncated?: boolean };
              }
            | undefined
          >;
        };
        const upload = await multipart.file();
        if (!upload) throw uploadValidationError("Choose one file to upload.");
        const chunks: Buffer[] = [];
        for await (const chunk of upload.file)
          chunks.push(Buffer.from(chunk as Uint8Array));
        if (upload.file.truncated)
          throw uploadValidationError(
            "Choose a file smaller than 10 MiB.",
            413,
          );
        return reply
          .code(201)
          .send(
            await deps.service.upload(
              await deps.authenticate(request),
              request.params.companyId,
              Buffer.concat(chunks),
            ),
          );
      },
    );
    return Promise.resolve();
  };
}
