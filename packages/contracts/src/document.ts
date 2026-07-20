import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";

const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;

export const DocumentFormatSchema = z.enum(["markdown", "html"]);
export const CommitShaSchema = z
  .string()
  .regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);

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

export const UpdateDocumentInputSchema = z
  .object({
    styleVersionId: UuidSchema.optional(),
    format: DocumentFormatSchema,
    body: DocumentBodySchema,
  })
  .strict();

export const RevertDocumentInputSchema = z
  .object({
    commitSha: CommitShaSchema,
  })
  .strict();

export const DocumentSchema = z
  .object({
    id: UuidSchema,
    companyId: UuidSchema,
    title: z.string().min(1).max(200),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();

export const DocumentCommitSchema = z
  .object({
    documentId: UuidSchema,
    commitSha: CommitShaSchema,
    parentCommitSha: CommitShaSchema.nullable(),
    styleVersionId: UuidSchema,
    format: DocumentFormatSchema,
    createdByType: z.enum(["user", "credential"]),
    createdById: UuidSchema,
    createdAt: TimestampSchema,
  })
  .strict();

export const DocumentSnapshotSchema = z
  .object({
    documentId: UuidSchema,
    commitSha: CommitShaSchema,
    styleVersionId: UuidSchema,
    format: DocumentFormatSchema,
    body: DocumentBodySchema,
  })
  .strict();

export const DocumentCurrentSourceSchema = z
  .object({
    commit: DocumentCommitSchema,
    snapshot: DocumentSnapshotSchema,
  })
  .strict();

export const DocumentDetailSchema = z
  .object({
    document: DocumentSchema,
    current: DocumentCurrentSourceSchema,
    commits: z.array(DocumentCommitSchema),
  })
  .strict();

export type DocumentFormat = z.infer<typeof DocumentFormatSchema>;
export type CommitSha = z.infer<typeof CommitShaSchema>;
export type CreateDocumentInput = z.infer<typeof CreateDocumentInputSchema>;
export type UpdateDocumentInput = z.infer<typeof UpdateDocumentInputSchema>;
export type RevertDocumentInput = z.infer<typeof RevertDocumentInputSchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type DocumentCommit = z.infer<typeof DocumentCommitSchema>;
export type DocumentSnapshot = z.infer<typeof DocumentSnapshotSchema>;
export type DocumentCurrentSource = z.infer<typeof DocumentCurrentSourceSchema>;
export type DocumentDetail = z.infer<typeof DocumentDetailSchema>;
