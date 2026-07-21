import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const FontFamilySchema = z.enum([
  "Inter",
  "IBM Plex Sans",
  "Source Sans 3",
  "Noto Sans",
  "Manrope",
  "DM Sans",
  "Work Sans",
  "Lato",
  "Montserrat",
  "Open Sans",
  "Noto Serif",
  "Libertinus Serif",
  "Fraunces",
  "Lora",
  "Merriweather",
  "Source Serif 4",
  "Playfair Display",
  "Libre Baskerville",
  "IBM Plex Mono",
  "Source Code Pro",
]);
export const FontReferenceSchema = z.union([FontFamilySchema, UuidSchema]);

const LengthMmSchema = z.number().min(0).max(80);
const TextStyleSchema = z
  .object({
    fontFamily: FontReferenceSchema,
    fontSizePt: z.number().min(6).max(72),
    fontWeight: z.union([
      z.literal(400),
      z.literal(500),
      z.literal(600),
      z.literal(700),
    ]),
    lineHeight: z.number().min(1).max(2),
    color: HexColorSchema,
  })
  .strict();
const TextStylesSchema = z
  .object({
    h1: TextStyleSchema,
    h2: TextStyleSchema,
    h3: TextStyleSchema,
    h4: TextStyleSchema,
    h5: TextStyleSchema,
    h6: TextStyleSchema,
    caption: TextStyleSchema,
    body: TextStyleSchema.optional(),
  })
  .strict();
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
    assetVersion: z.literal(1).optional(),
    logoObjectId: UuidSchema.nullable(),
    bodyFont: FontReferenceSchema,
    headingFont: FontReferenceSchema,
    bodySizePt: z.number().min(8).max(16),
    headingScale: z.number().min(1.05).max(2.5),
    textStyles: TextStylesSchema.optional(),
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
  .strict()
  .superRefine((definition, context) => {
    if (definition.assetVersion === 1) return;
    const references = [
      definition.bodyFont,
      definition.headingFont,
      ...Object.values(definition.textStyles ?? {}).flatMap((textStyle) =>
        textStyle ? [textStyle.fontFamily] : [],
      ),
    ];
    if (
      references.some(
        (reference) => !FontFamilySchema.safeParse(reference).success,
      )
    )
      context.addIssue({
        code: "custom",
        message: "Custom fonts require assetVersion 1",
      });
  });

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

export type TextStyles = z.infer<typeof TextStylesSchema>;
export type TextStyleRole = keyof TextStyles;
export type StyleDefinition = z.infer<typeof StyleDefinitionSchema>;
export type Style = z.infer<typeof StyleSchema>;
export type StyleVersion = z.infer<typeof StyleVersionSchema>;
