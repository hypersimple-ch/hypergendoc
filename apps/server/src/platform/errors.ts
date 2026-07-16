import type { ErrorEnvelope } from "@hypergendoc/contracts";
import type { FastifyInstance } from "fastify";

export type AppErrorCode = ErrorEnvelope["error"]["code"];
const messages: Record<AppErrorCode, string> = {
  unauthenticated: "Authentication required",
  forbidden: "Access denied",
  not_found: "Not found",
  conflict: "Conflict",
  validation_failed: "Invalid request",
  rate_limited: "Too many requests",
  render_rejected: "Render request rejected",
  render_failed: "Render failed",
  dependency_unavailable: "Service temporarily unavailable",
  internal_error: "Internal server error",
};

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly statusCode: number,
    readonly details?: NonNullable<ErrorEnvelope["error"]["details"]>,
  ) {
    super(messages[code]);
  }
}

export function toSafeError(
  error: unknown,
  requestId: string,
): { statusCode: number; body: ErrorEnvelope } {
  const appError =
    error instanceof AppError ? error : new AppError("internal_error", 500);
  return {
    statusCode: appError.statusCode,
    body: {
      error: {
        code: appError.code,
        message: appError.message,
        requestId,
        ...(appError.details === undefined
          ? {}
          : { details: appError.details }),
      },
    },
  };
}

export function registerSafeErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const safe = toSafeError(error, request.id);
    void reply.status(safe.statusCode).send(safe.body);
  });
}
