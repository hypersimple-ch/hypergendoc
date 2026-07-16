import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";

export const McpActionSchema = z.enum([
  "companies:read",
  "styles:read",
  "documents:read",
  "documents:write",
]);

const unique = <T>(items: T[]) => new Set(items).size === items.length;

export const CreateMcpCredentialInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    companyIds: z
      .array(UuidSchema)
      .min(1)
      .max(100)
      .refine(unique, "Company IDs must be unique"),
    actions: z
      .array(McpActionSchema)
      .min(1)
      .max(4)
      .refine(unique, "Actions must be unique"),
    expiresAt: TimestampSchema.optional(),
  })
  .strict();

export const McpCredentialSchema = z
  .object({
    id: UuidSchema,
    workspaceId: UuidSchema,
    name: z.string().min(1).max(120),
    prefix: z.string().min(6).max(32),
    companyIds: z.array(UuidSchema),
    actions: z.array(McpActionSchema),
    expiresAt: TimestampSchema.nullable(),
    revokedAt: TimestampSchema.nullable(),
    lastUsedAt: TimestampSchema.nullable(),
    createdAt: TimestampSchema,
  })
  .strict();

export const CreatedMcpCredentialSchema = z
  .object({
    credential: McpCredentialSchema,
    token: z.string().min(32).max(512),
  })
  .strict();

export type McpAction = z.infer<typeof McpActionSchema>;
export type McpCredential = z.infer<typeof McpCredentialSchema>;
