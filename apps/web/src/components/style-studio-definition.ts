import type {
  StyleDefinition,
  TextStyleRole,
  TextStyles,
} from "@hypergendoc/contracts";

export const fontGroups = [
  {
    label: "Sans",
    fonts: [
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
      "Roboto",
      "Poppins",
      "Nunito Sans",
      "Nunito",
      "Archivo",
      "Karla",
      "Roboto Condensed",
      "Merriweather Sans",
      "Ubuntu",
      "Oswald",
      "Raleway",
      "Figtree",
      "Plus Jakarta Sans",
      "Outfit",
      "Rubik",
    ],
  },
  {
    label: "Serif",
    fonts: [
      "Noto Serif",
      "Libertinus Serif",
      "Fraunces",
      "Lora",
      "Merriweather",
      "Source Serif 4",
      "Playfair Display",
      "Libre Baskerville",
      "Roboto Slab",
      "PT Serif",
      "Crimson Pro",
      "Cormorant Garamond",
      "DM Serif Display",
      "Alegreya",
      "EB Garamond",
    ],
  },
  {
    label: "Mono",
    fonts: [
      "IBM Plex Mono",
      "Source Code Pro",
      "JetBrains Mono",
      "Fira Code",
      "Space Mono",
      "Roboto Mono",
      "Inconsolata",
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  fonts: readonly StyleDefinition["bodyFont"][];
}>;

export const fonts = fontGroups.flatMap((group) => group.fonts);

export const colorKeys = [
  "text",
  "heading",
  "primary",
  "accent",
  "muted",
] as const;
export type ColorKey = (typeof colorKeys)[number];

export const textStyleRoles: { value: TextStyleRole; label: string }[] = [
  { value: "body", label: "Body" },
  { value: "h1", label: "H1" },
  { value: "h2", label: "H2" },
  { value: "h3", label: "H3" },
  { value: "h4", label: "H4" },
  { value: "h5", label: "H5" },
  { value: "h6", label: "H6" },
  { value: "caption", label: "Caption" },
];

export const initialTextStyles: TextStyles = {
  body: {
    fontFamily: "Inter",
    fontSizePt: 10,
    fontWeight: 400,
    lineHeight: 1.5,
    color: "#1D2624",
  },
  h1: {
    fontFamily: "Noto Serif",
    fontSizePt: 28,
    fontWeight: 700,
    lineHeight: 1.15,
    color: "#1D403C",
  },
  h2: {
    fontFamily: "Noto Serif",
    fontSizePt: 22,
    fontWeight: 700,
    lineHeight: 1.2,
    color: "#1D403C",
  },
  h3: {
    fontFamily: "Noto Serif",
    fontSizePt: 18,
    fontWeight: 600,
    lineHeight: 1.25,
    color: "#1D403C",
  },
  h4: {
    fontFamily: "Noto Serif",
    fontSizePt: 15,
    fontWeight: 600,
    lineHeight: 1.3,
    color: "#1D403C",
  },
  h5: {
    fontFamily: "Noto Serif",
    fontSizePt: 12,
    fontWeight: 600,
    lineHeight: 1.35,
    color: "#1D403C",
  },
  h6: {
    fontFamily: "Noto Serif",
    fontSizePt: 10,
    fontWeight: 600,
    lineHeight: 1.4,
    color: "#1D403C",
  },
  caption: {
    fontFamily: "Inter",
    fontSizePt: 8,
    fontWeight: 500,
    lineHeight: 1.3,
    color: "#68716B",
  },
};

export function legacyTextStyles(definition: StyleDefinition): TextStyles {
  const heading = (
    fontSizePt: number,
    fontWeight: 400 | 500 | 600 | 700,
    lineHeight: number,
  ) => ({
    fontFamily: definition.headingFont,
    fontSizePt: Math.max(6, Math.min(72, fontSizePt)),
    fontWeight,
    lineHeight,
    color: definition.colors.heading,
  });
  return {
    body: {
      fontFamily: definition.bodyFont,
      fontSizePt: definition.bodySizePt,
      fontWeight: 400,
      lineHeight: 1.5,
      color: definition.colors.text,
    },
    h1: heading(definition.bodySizePt * definition.headingScale, 700, 1.2),
    h2: heading(
      definition.bodySizePt * definition.headingScale * 0.85,
      700,
      1.2,
    ),
    h3: heading(definition.bodySizePt * 1.17, 700, 1.2),
    h4: heading(definition.bodySizePt, 700, 1.2),
    h5: heading(definition.bodySizePt * 0.83, 700, 1.2),
    h6: heading(definition.bodySizePt * 0.67, 700, 1.2),
    caption: {
      fontFamily: definition.bodyFont,
      fontSizePt: Math.max(6, definition.bodySizePt * 0.8),
      fontWeight: 500,
      lineHeight: 1.3,
      color: definition.colors.muted,
    },
  };
}

type ResolvedTextStyles = Omit<TextStyles, "body"> & {
  body: NonNullable<TextStyles["body"]>;
};

export function resolveTextStyles(
  definition: StyleDefinition,
): ResolvedTextStyles {
  const legacy = legacyTextStyles(definition);
  return {
    ...legacy,
    ...definition.textStyles,
    body: definition.textStyles?.body ?? legacy.body,
  } as ResolvedTextStyles;
}

export const initialStyleDefinition: StyleDefinition = {
  assetVersion: 1,
  logoObjectId: null,
  bodyFont: "Inter",
  headingFont: "Noto Serif",
  bodySizePt: 10,
  headingScale: 1.5,
  textStyles: initialTextStyles,
  italicStyle: "italic",
  colors: {
    text: "#1D2624",
    heading: "#1D403C",
    primary: "#1D403C",
    accent: "#A9442A",
    muted: "#68716B",
  },
  page: {
    size: "A4",
    marginTopMm: 20,
    marginRightMm: 20,
    marginBottomMm: 20,
    marginLeftMm: 20,
  },
  header: {
    enabled: false,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: false,
  },
  footer: {
    enabled: false,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: true,
  },
};

export function normalizeHex(value: string) {
  const raw = value.trim().replace(/^#/, "");
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => part + part)
          .join("")
      : raw;
  return /^[0-9a-f]{6}$/i.test(expanded) ? `#${expanded.toUpperCase()}` : null;
}
