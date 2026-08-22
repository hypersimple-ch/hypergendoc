import type { ErrorEnvelope } from "@hypergendoc/contracts";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

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
    message: string = messages[code],
  ) {
    super(message);
  }
}

export function uploadValidationError(
  message: string,
  statusCode: 400 | 413 = 400,
): AppError {
  return new AppError("validation_failed", statusCode, undefined, message);
}

const multipartSizeErrorCodes = new Set([
  "FST_REQ_FILE_TOO_LARGE",
  "FST_FILES_LIMIT",
  "FST_FIELDS_LIMIT",
  "FST_PARTS_LIMIT",
]);
const malformedMultipartErrorCodes = new Set([
  "FST_INVALID_MULTIPART_CONTENT_TYPE",
  "FST_INVALID_JSON_FIELD_ERROR",
  "FST_MP_PREMATURE_CLOSE",
  "FST_PROTO_VIOLATION",
]);

export function normalizeTransportError(error: unknown): unknown {
  const code = (error as { code?: unknown })?.code;
  if (typeof code !== "string") return error;
  if (code === "FST_ERR_CTP_BODY_TOO_LARGE")
    return new AppError("validation_failed", 413);
  if (multipartSizeErrorCodes.has(code))
    return uploadValidationError("Choose a file smaller than 10 MiB.", 413);
  if (malformedMultipartErrorCodes.has(code))
    return uploadValidationError("Choose one valid file to upload.");
  return error;
}

export function toSafeError(
  error: unknown,
  requestId: string,
): { statusCode: number; body: ErrorEnvelope } {
  const normalized = normalizeTransportError(error);
  const appError =
    normalized instanceof AppError
      ? normalized
      : normalized instanceof ZodError
        ? new AppError("validation_failed", 400)
        : new AppError("internal_error", 500);
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
