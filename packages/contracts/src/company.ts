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

export type Company = z.infer<typeof CompanySchema>;
export type CreateCompanyInput = z.infer<typeof CreateCompanyInputSchema>;
