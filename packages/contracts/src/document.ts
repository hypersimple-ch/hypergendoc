import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";

const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;

export const LatexBodySchema = z
  .string()
  .min(1)
  .refine(
    (value) => utf8Bytes(value) <= 256 * 1024,
    "Body exceeds 256 KiB UTF-8",
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
    body: LatexBodySchema,
    metadata: DocumentMetadataSchema.optional(),
  })
  .strict();

export const CreateDocumentVersionInputSchema = z
  .object({
    body: LatexBodySchema,
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
    body: LatexBodySchema,
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

export type CreateDocumentInput = z.infer<typeof CreateDocumentInputSchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
