import { z } from "zod";

export const API_VERSION = "v1" as const;
export const ApiVersionSchema = z.literal(API_VERSION);
export const UuidSchema = z.uuid();
export const TimestampSchema = z.iso.datetime({ offset: true });
export const RequestIdSchema = z.string().min(8).max(128);

export const PaginationInputSchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();

export const ErrorCodeSchema = z.enum([
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "validation_failed",
  "rate_limited",
  "render_rejected",
  "render_failed",
  "dependency_unavailable",
  "internal_error",
]);

export const ErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: ErrorCodeSchema,
        message: z.string().min(1).max(256),
        requestId: RequestIdSchema,
        details: z
          .array(
            z
              .object({
                path: z.string().max(256),
                code: z.string().min(1).max(64),
              })
              .strict(),
          )
          .max(32)
          .optional(),
      })
      .strict(),
  })
  .strict();

export const AuditMetadataSchema = z
  .object({
    actorType: z.enum(["user", "credential", "system"]),
    actorId: UuidSchema.nullable(),
    requestId: RequestIdSchema,
    createdAt: TimestampSchema,
  })
  .strict();

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
export type AuditMetadata = z.infer<typeof AuditMetadataSchema>;
