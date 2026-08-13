import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";

export const CompanySchema = z
  .object({
    id: UuidSchema,
    workspaceId: UuidSchema,
    name: z.string().min(1).max(160),
    archivedAt: TimestampSchema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();

export const CreateCompanyInputSchema = z
  .object({ name: z.string().trim().min(1).max(160) })
  .strict();

export const UpdateCompanyInputSchema = CreateCompanyInputSchema.partial();

/** Explicit lifecycle command contract for restoring an archived company. */
export const RestoreCompanyInputSchema = z.object({}).strict();

export type Company = z.infer<typeof CompanySchema>;
export type CreateCompanyInput = z.infer<typeof CreateCompanyInputSchema>;
export type RestoreCompanyInput = z.infer<typeof RestoreCompanyInputSchema>;
