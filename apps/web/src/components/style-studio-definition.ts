import type { StyleDefinition } from "@hypergendoc/contracts";

export const fonts: StyleDefinition["bodyFont"][] = [
  "Inter",
  "IBM Plex Sans",
  "Source Sans 3",
  "Noto Sans",
  "Noto Serif",
  "Libertinus Serif",
];

export const colorKeys = [
  "text",
  "heading",
  "primary",
  "accent",
  "muted",
] as const;
export type ColorKey = (typeof colorKeys)[number];

export const initialStyleDefinition: StyleDefinition = {
  logoObjectId: null,
  bodyFont: "Inter",
  headingFont: "Noto Serif",
  bodySizePt: 10,
  headingScale: 1.5,
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
