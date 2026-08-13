import { z } from "zod";
import { PaginationInputSchema, UuidSchema } from "./common.js";
import {
  CommitShaSchema,
  CreateDocumentInputSchema,
  RevertDocumentInputSchema,
  UpdateDocumentInputSchema,
} from "./document.js";
import {
  CreateTemplateDocumentInputSchema,
  UpdateTemplateDocumentInputSchema,
} from "./template.js";

export const ListCompaniesToolInputSchema = PaginationInputSchema;
export const ListStylesToolInputSchema = PaginationInputSchema.extend({
  companyId: UuidSchema,
}).strict();
export const ListTemplatesToolInputSchema = PaginationInputSchema.extend({
  companyId: UuidSchema,
}).strict();
export const GetTemplateToolInputSchema = z
  .object({ templateId: UuidSchema, versionId: UuidSchema.optional() })
  .strict();
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
export const CreateTemplateDocumentToolInputSchema =
  CreateTemplateDocumentInputSchema;
export const UpdateTemplateDocumentToolInputSchema =
  UpdateTemplateDocumentInputSchema.extend({
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
  "list_templates",
  "get_template",
  "list_documents",
  "get_document",
  "create_document",
  "update_document",
  "create_document_from_template",
  "update_template_document",
  "list_document_commits",
  "read_document_commit",
  "revert_document",
]);
