import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";
import { FontFamilySchema, HexColorSchema } from "./style.js";

const AssetContentPathSchema = z.string().regex(/^\/api\/companies\//);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const Base64Schema = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);

export const CompanyLogoAssetSchema = z
  .object({
    id: UuidSchema,
    displayName: z.string().min(1).max(255).nullable(),
    contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    byteSize: z.number().int().positive(),
    contentUrl: AssetContentPathSchema,
    createdAt: TimestampSchema,
  })
  .strict();

export const CompanyFontAssetSchema = z
  .object({
    id: z.union([FontFamilySchema, UuidSchema]),
    source: z.enum(["built_in", "uploaded"]),
    familyName: z.string().min(1).max(255),
    subfamilyName: z.string().min(1).max(255).nullable(),
    displayName: z.string().min(1).max(255),
    owned: z.boolean(),
    contentUrl: AssetContentPathSchema.nullable(),
  })
  .strict()
  .superRefine((font, context) => {
    if (font.source === "built_in") {
      if (!FontFamilySchema.safeParse(font.id).success || font.contentUrl)
        context.addIssue({ code: "custom", message: "Invalid built-in font" });
      return;
    }
    if (
      !UuidSchema.safeParse(font.id).success ||
      !font.contentUrl ||
      !font.owned
    )
      context.addIssue({ code: "custom", message: "Invalid uploaded font" });
  });

export const CompanyAssetsSchema = z
  .object({
    logos: z.array(CompanyLogoAssetSchema),
    fonts: z.array(CompanyFontAssetSchema),
    colors: z.array(HexColorSchema),
  })
  .strict();

const ResolvedAssetFields = {
  contentType: z.string().min(1).max(120),
  byteSize: z.number().int().positive(),
  sha256: Sha256Schema,
  base64: Base64Schema,
} as const;

export const ResolvedLogoAssetSchema = z
  .object({ id: UuidSchema, ...ResolvedAssetFields })
  .strict();
export const ResolvedFontAssetSchema = z
  .object({ id: UuidSchema, ...ResolvedAssetFields })
  .strict();
export const ResolvedStyleAssetsSchema = z
  .object({
    logo: ResolvedLogoAssetSchema.nullable().default(null),
    fonts: z.array(ResolvedFontAssetSchema).default([]),
  })
  .strict();

export type CompanyLogoAsset = z.infer<typeof CompanyLogoAssetSchema>;
export type CompanyFontAsset = z.infer<typeof CompanyFontAssetSchema>;
export type CompanyAssets = z.infer<typeof CompanyAssetsSchema>;
export type ResolvedLogoAsset = z.infer<typeof ResolvedLogoAssetSchema>;
export type ResolvedFontAsset = z.infer<typeof ResolvedFontAssetSchema>;
export type ResolvedStyleAssets = z.infer<typeof ResolvedStyleAssetsSchema>;
