import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";

const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;

export const DocumentFormatSchema = z.enum(["markdown", "html"]);

export const DocumentBodySchema = z
  .string()
  .min(1)
  .refine(
    (value) => utf8Bytes(value) <= 256 * 1024,
    "Body exceeds 256 KiB UTF-8",
  )
  .refine(
    (value) =>
      ![...value].some((char) => {
        const codePoint = char.codePointAt(0)!;
        return (
          codePoint === 0 ||
          codePoint === 0xfffd ||
          (codePoint < 0x20 && ![0x09, 0x0a, 0x0d].includes(codePoint)) ||
          codePoint === 0x7f
        );
      }),
    "Body contains unsafe control characters",
  );

export const DocumentMetadataSchema = z
  .record(z.string().max(64), z.string().max(512))
  .refine(
    (value) => Object.keys(value).length <= 32,
    "At most 32 metadata fields are allowed",
  );

export const DocumentStatusSchema = z.enum(["pending", "ready", "failed"]);

export const CreateDocumentInputSchema = z
  .object({
    companyId: UuidSchema,
    styleId: UuidSchema,
    title: z.string().trim().min(1).max(200),
    format: DocumentFormatSchema,
    body: DocumentBodySchema,
    metadata: DocumentMetadataSchema.optional(),
  })
  .strict();

export const CreateDocumentVersionInputSchema = z
  .object({
    format: DocumentFormatSchema,
    body: DocumentBodySchema,
    styleVersionId: UuidSchema.optional(),
  })
  .strict();

export const DocumentSchema = z
  .object({
    id: UuidSchema,
    companyId: UuidSchema,
    title: z.string().min(1).max(200),
    currentVersionId: UuidSchema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();

export const DocumentVersionSchema = z
  .object({
    id: UuidSchema,
    documentId: UuidSchema,
    version: z.number().int().positive(),
    styleVersionId: UuidSchema,
    format: DocumentFormatSchema,
    body: DocumentBodySchema,
    status: DocumentStatusSchema,
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    outputHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    rendererVersion: z.string().min(1).max(128).nullable(),
    createdByType: z.enum(["user", "credential"]),
    createdById: UuidSchema,
    createdAt: TimestampSchema,
  })
  .strict();

export type DocumentFormat = z.infer<typeof DocumentFormatSchema>;
export type CreateDocumentInput = z.infer<typeof CreateDocumentInputSchema>;
export type CreateDocumentVersionInput = z.infer<
  typeof CreateDocumentVersionInputSchema
>;
export type Document = z.infer<typeof DocumentSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
