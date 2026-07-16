import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const FontFamilySchema = z.enum([
  "Inter",
  "IBM Plex Sans",
  "Source Sans 3",
  "Noto Sans",
  "Noto Serif",
  "Libertinus Serif",
]);

const LengthMmSchema = z.number().min(0).max(80);
const HeaderFooterSchema = z
  .object({
    enabled: z.boolean(),
    leftText: z.string().max(120).default(""),
    centerText: z.string().max(120).default(""),
    rightText: z.string().max(120).default(""),
    showPageNumber: z.boolean().default(false),
  })
  .strict();

export const StyleDefinitionSchema = z
  .object({
    logoObjectId: UuidSchema.nullable(),
    bodyFont: FontFamilySchema,
    headingFont: FontFamilySchema,
    bodySizePt: z.number().min(8).max(16),
    headingScale: z.number().min(1.05).max(2.5),
    italicStyle: z.enum(["italic", "oblique"]),
    colors: z
      .object({
        text: HexColorSchema,
        heading: HexColorSchema,
        primary: HexColorSchema,
        accent: HexColorSchema,
        muted: HexColorSchema,
      })
      .strict(),
    page: z
      .object({
        size: z.enum(["A4", "LETTER"]),
        marginTopMm: LengthMmSchema,
        marginRightMm: LengthMmSchema,
        marginBottomMm: LengthMmSchema,
        marginLeftMm: LengthMmSchema,
      })
      .strict(),
    header: HeaderFooterSchema,
    footer: HeaderFooterSchema,
  })
  .strict();

export const CreateStyleInputSchema = z
  .object({
    companyId: UuidSchema,
    name: z.string().trim().min(1).max(120),
    definition: StyleDefinitionSchema,
  })
  .strict();

export const CreateStyleVersionInputSchema = z
  .object({
    definition: StyleDefinitionSchema,
    activate: z.boolean().default(true),
  })
  .strict();

export const StyleSchema = z
  .object({
    id: UuidSchema,
    companyId: UuidSchema,
    name: z.string().min(1).max(120),
    activeVersionId: UuidSchema.nullable(),
    archivedAt: TimestampSchema.nullable(),
    createdAt: TimestampSchema,
  })
  .strict();

export const StyleVersionSchema = z
  .object({
    id: UuidSchema,
    styleId: UuidSchema,
    version: z.number().int().positive(),
    definition: StyleDefinitionSchema,
    createdByUserId: UuidSchema,
    createdAt: TimestampSchema,
  })
  .strict();

export type StyleDefinition = z.infer<typeof StyleDefinitionSchema>;
export type Style = z.infer<typeof StyleSchema>;
export type StyleVersion = z.infer<typeof StyleVersionSchema>;
