import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";

export const WorkspaceRoleSchema = z.enum(["owner", "member"]);
export const EmailSchema = z
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());
export const PasswordSchema = z.string().min(12).max(128);

export const RegisterInputSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const LoginInputSchema = z
  .object({ email: EmailSchema, password: z.string().min(1).max(128) })
  .strict();

export const WorkspaceSchema = z
  .object({
    id: UuidSchema,
    name: z.string().min(1).max(120),
    createdAt: TimestampSchema,
  })
  .strict();

export const MembershipSchema = z
  .object({
    id: UuidSchema,
    workspaceId: UuidSchema,
    userId: UuidSchema,
    role: WorkspaceRoleSchema,
    createdAt: TimestampSchema,
  })
  .strict();

export const InviteMemberInputSchema = z
  .object({ email: EmailSchema, role: WorkspaceRoleSchema })
  .strict();

export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
