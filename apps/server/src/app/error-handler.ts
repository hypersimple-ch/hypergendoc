import { DocumentInputError } from "@hypergendoc/document";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AuthorizationError } from "../modules/memberships/service.js";
import {
  AppError,
  normalizeTransportError,
  toSafeError,
} from "../platform/errors.js";

export function registerApplicationErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const mapped =
      error instanceof AuthorizationError
        ? new AppError(
            error.code,
            error.code === "forbidden"
              ? 403
              : error.code === "conflict"
                ? 409
                : 404,
          )
        : error instanceof ZodError || error instanceof DocumentInputError
          ? new AppError("validation_failed", 400)
          : normalizeTransportError(error);
    const safe = toSafeError(mapped, request.id);
    if (safe.statusCode >= 500)
      request.log.error(
        { requestId: request.id, code: safe.body.error.code },
        "Request failed",
      );
    void reply.status(safe.statusCode).send(safe.body);
  });
}
