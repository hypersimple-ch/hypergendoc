import { z } from "zod";
import { PaginationInputSchema, UuidSchema } from "./common.js";
import {
  CreateDocumentInputSchema,
  CreateDocumentVersionInputSchema,
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
export const GetDocumentVersionToolInputSchema = z
  .object({ documentId: UuidSchema, version: z.number().int().positive() })
  .strict();
export const CreateDocumentToolInputSchema = CreateDocumentInputSchema;
export const CreateDocumentVersionToolInputSchema =
  CreateDocumentVersionInputSchema.extend({
    documentId: UuidSchema,
  }).strict();

export const McpToolNameSchema = z.enum([
  "list_companies",
  "list_styles",
  "list_documents",
  "get_document",
  "get_document_version",
  "create_document",
  "create_document_version",
]);
