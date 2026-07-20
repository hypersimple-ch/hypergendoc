import { z } from "zod";
import { PaginationInputSchema, UuidSchema } from "./common.js";
import {
  CommitShaSchema,
  CreateDocumentInputSchema,
  RevertDocumentInputSchema,
  UpdateDocumentInputSchema,
} from "./document.js";

export const ListCompaniesToolInputSchema = PaginationInputSchema;
export const ListStylesToolInputSchema = PaginationInputSchema.extend({
  companyId: UuidSchema,
}).strict();
export const ListDocumentsToolInputSchema = PaginationInputSchema.extend({
  companyId: UuidSchema,
}).strict();
export const GetDocumentToolInputSchema = z
  .object({ documentId: UuidSchema })
  .strict();
export const CreateDocumentToolInputSchema = CreateDocumentInputSchema;
export const UpdateDocumentToolInputSchema = UpdateDocumentInputSchema.extend({
  documentId: UuidSchema,
}).strict();
export const ListDocumentCommitsToolInputSchema = PaginationInputSchema.extend({
  documentId: UuidSchema,
}).strict();
export const ReadDocumentCommitToolInputSchema = z
  .object({ documentId: UuidSchema, commitSha: CommitShaSchema })
  .strict();
export const RevertDocumentToolInputSchema = RevertDocumentInputSchema.extend({
  documentId: UuidSchema,
}).strict();

export const McpToolNameSchema = z.enum([
  "list_companies",
  "list_styles",
  "list_documents",
  "get_document",
  "create_document",
  "update_document",
  "list_document_commits",
  "read_document_commit",
  "revert_document",
]);
