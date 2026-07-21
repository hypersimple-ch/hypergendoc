import { createHash } from "node:crypto";
import type {
  DocumentFormat,
  ResolvedStyleAssets,
  StyleDefinition,
} from "@hypergendoc/contracts";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export const DOCUMENT_BODY_MAX_BYTES = 256 * 1024;
export const DOCUMENT_MAX_PAGES = 100;

export type DocumentInputIssueCode =
  | "body_empty"
  | "body_too_large"
  | "invalid_body"
  | "invalid_format"
  | "invalid_assets";

/** An intentionally detail-free validation error safe to return to clients. */
export class DocumentInputError extends Error {
  constructor(public readonly code: DocumentInputIssueCode) {
    super(code);
    this.name = "DocumentInputError";
  }
}

const fail = (code: DocumentInputIssueCode): never => {
  throw new DocumentInputError(code);
};

const hasUnsafeCodePoint = (body: string) =>
  [...body].some((char) => {
    const codePoint = char.codePointAt(0)!;
    return (
      codePoint === 0 ||
      codePoint === 0xfffd ||
      (codePoint < 0x20 && ![0x09, 0x0a, 0x0d].includes(codePoint)) ||
      codePoint === 0x7f
    );
  });

export function validateDocumentInput(
  format: DocumentFormat,
  body: string,
): string {
  if (format !== "markdown" && format !== "html") fail("invalid_format");
  if (typeof body !== "string" || !body.length) fail("body_empty");
  if (Buffer.byteLength(body, "utf8") > DOCUMENT_BODY_MAX_BYTES)
    fail("body_too_large");
  if (hasUnsafeCodePoint(body)) fail("invalid_body");
  return body;
}

const allowedTags = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "strong",
  "em",
  "del",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "a",
  "table",
  "caption",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "sup",
  "sub",
];

const safeHref = (href: string | undefined) =>
  href && (/^https:\/\/[^\s]+$/i.test(href) || /^mailto:[^\s]+$/i.test(href))
    ? href
    : undefined;

const sanitizeFragment = (source: string) =>
  sanitizeHtml(source, {
    allowedTags,
    allowedAttributes: { a: ["href", "title", "rel"] },
    allowedSchemes: ["https", "mailto"],
    allowProtocolRelative: false,
    nonTextTags: [
      "script",
      "style",
      "textarea",
      "option",
      "noscript",
      "iframe",
      "object",
      "embed",
      "svg",
    ],
    transformTags: {
      a: (_tagName, attribs) => {
        const href = safeHref(attribs.href);
        return {
          tagName: "a",
          attribs: {
            ...(href ? { href } : {}),
            ...(attribs.title ? { title: attribs.title } : {}),
            ...(href ? { rel: "noopener noreferrer" } : {}),
          },
        };
      },
    },
  });

const semanticText = (fragment: string) =>
  sanitizeHtml(fragment, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();

const escapeCssString = (value: string) =>
  [...value]
    .map((char) => {
      const codePoint = char.codePointAt(0)!;
      if (
        char === '"' ||
        char === "\\" ||
        char === "<" ||
        char === ">" ||
        char === "{" ||
        char === "}" ||
        codePoint === 0 ||
        codePoint < 0x20 ||
        codePoint === 0x7f
      ) {
        return `\\${codePoint.toString(16)} `;
      }
      return char;
    })
    .join("");

const font = (name: StyleDefinition["bodyFont"]) =>
  ({
    Inter: "Arial, sans-serif",
    "IBM Plex Sans": "Arial, sans-serif",
    "Source Sans 3": "Arial, sans-serif",
    "Noto Sans": "Arial, sans-serif",
    Manrope: "Arial, sans-serif",
    "DM Sans": "Arial, sans-serif",
    "Work Sans": "Arial, sans-serif",
    Lato: "Arial, sans-serif",
    Montserrat: "Arial, sans-serif",
    "Open Sans": "Arial, sans-serif",
    "Noto Serif": "Georgia, serif",
    "Libertinus Serif": "Georgia, serif",
    Fraunces: "Georgia, serif",
    Lora: "Georgia, serif",
    Merriweather: "Georgia, serif",
    "Source Serif 4": "Georgia, serif",
    "Playfair Display": "Georgia, serif",
    "Libre Baskerville": "Georgia, serif",
    "IBM Plex Mono": "Courier New, monospace",
    "Source Code Pro": "Courier New, monospace",
  })[name];

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const MAX_FONT_BYTES = 10 * 1024 * 1024;
const MAX_RENDER_ASSET_BYTES = 30 * 1024 * 1024;
const logoTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const fontFormats = new Map([
  ["font/ttf", "truetype"],
  ["font/otf", "opentype"],
  ["font/woff2", "woff2"],
]);
const emptyAssets: ResolvedStyleAssets = { logo: null, fonts: [] };

const decodedAsset = (asset: {
  contentType: string;
  byteSize: number;
  sha256: string;
  base64: string;
}) => {
  if (
    !/^[a-f0-9]{64}$/.test(asset.sha256) ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.base64) ||
    asset.base64.length % 4 !== 0
  )
    fail("invalid_assets");
  const bytes = Buffer.from(asset.base64, "base64");
  if (
    !bytes.byteLength ||
    bytes.byteLength !== asset.byteSize ||
    bytes.toString("base64") !== asset.base64 ||
    createHash("sha256").update(bytes).digest("hex") !== asset.sha256
  )
    fail("invalid_assets");
  return bytes;
};

const fontFamily = (id: string) => `HypergendocFont_${id.replaceAll("-", "")}`;

function resolveAssets(
  style: StyleDefinition,
  assets: ResolvedStyleAssets | undefined,
): {
  readonly assets: ResolvedStyleAssets;
  readonly fonts: Map<string, { contentType: string; base64: string }>;
} {
  const resolved = assets ?? emptyAssets;
  const references = [
    style.bodyFont,
    style.headingFont,
    ...Object.values(style.textStyles ?? {}).flatMap((textStyle) =>
      textStyle ? [textStyle.fontFamily] : [],
    ),
  ];
  const expected = new Set<string>();
  for (const reference of references) {
    if (font(reference)) continue;
    if (!uuidPattern.test(reference)) fail("invalid_assets");
    expected.add(reference);
  }
  if (
    (style.logoObjectId !== null && !uuidPattern.test(style.logoObjectId)) ||
    (style.logoObjectId === null ? resolved.logo !== null : !resolved.logo) ||
    (resolved.logo && resolved.logo.id !== style.logoObjectId) ||
    resolved.fonts.length !== expected.size
  )
    fail("invalid_assets");

  let totalBytes = 0;
  if (resolved.logo) {
    if (
      !uuidPattern.test(resolved.logo.id) ||
      !logoTypes.has(resolved.logo.contentType)
    )
      fail("invalid_assets");
    totalBytes += decodedAsset(resolved.logo).byteLength;
    if (resolved.logo.byteSize > MAX_LOGO_BYTES) fail("invalid_assets");
  }
  const fonts = new Map<string, { contentType: string; base64: string }>();
  for (const asset of resolved.fonts) {
    if (
      !uuidPattern.test(asset.id) ||
      !expected.has(asset.id) ||
      fonts.has(asset.id) ||
      !fontFormats.has(asset.contentType)
    )
      fail("invalid_assets");
    const bytes = decodedAsset(asset);
    if (asset.byteSize > MAX_FONT_BYTES) fail("invalid_assets");
    totalBytes += bytes.byteLength;
    fonts.set(asset.id, asset);
  }
  if (totalBytes > MAX_RENDER_ASSET_BYTES) fail("invalid_assets");
  return { assets: resolved, fonts };
}

const textStyleRoles = ["h1", "h2", "h3", "h4", "h5", "h6", "caption"] as const;

const pageMarginBoxes = (
  position: "top" | "bottom",
  value: StyleDefinition["header"],
  mutedColor: string,
) => {
  if (!value.enabled) return "";
  return (["left", "center", "right"] as const)
    .map((alignment) => {
      const text = value[`${alignment}Text`];
      const pageNumber = alignment === "right" && value.showPageNumber;
      return `@${position}-${alignment} { color: ${mutedColor}; content: "${escapeCssString(text)}"${pageNumber ? ' " " counter(page)' : ""}; font-size: 8pt; }`;
    })
    .join("\n");
};

/** Builds deterministic, standalone, server-owned HTML without external assets. */
export function renderDocumentHtml(
  body: string,
  format: DocumentFormat,
  style: StyleDefinition,
  assets?: ResolvedStyleAssets,
): string {
  const exactBody = validateDocumentInput(format, body);
  const assetRendering =
    style.assetVersion === 1 ? resolveAssets(style, assets) : undefined;
  const rendered =
    format === "markdown"
      ? marked.parse(exactBody, { async: false })
      : exactBody;
  const fragment = sanitizeFragment(rendered);
  if (!semanticText(fragment)) fail("invalid_body");

  const renderedFont = (reference: StyleDefinition["bodyFont"]) =>
    assetRendering?.fonts.has(reference)
      ? `"${fontFamily(reference)}", sans-serif`
      : font(reference);
  const legacyHeadingCss = `h1, h2, h3, h4, h5, h6 { color: ${style.colors.heading}; font-family: ${renderedFont(style.headingFont)}; line-height: 1.2; }
h1 { font-size: ${(style.bodySizePt * style.headingScale).toFixed(2)}pt; } h2 { font-size: ${(style.bodySizePt * style.headingScale * 0.85).toFixed(2)}pt; }`;
  const textStyles = style.textStyles;
  const textStylesCss = textStyles
    ? textStyleRoles
        .map((role) => {
          const textStyle = textStyles[role];
          return `${role} { color: ${textStyle.color}; font-family: ${renderedFont(textStyle.fontFamily)}; font-size: ${textStyle.fontSizePt}pt; font-weight: ${textStyle.fontWeight}; line-height: ${textStyle.lineHeight}; }`;
        })
        .join("\n")
    : legacyHeadingCss;
  const bodyTextStyle = textStyles?.body;
  const bodyCss = bodyTextStyle
    ? `color: ${bodyTextStyle.color}; font-family: ${renderedFont(bodyTextStyle.fontFamily)}; font-size: ${bodyTextStyle.fontSizePt}pt; font-weight: ${bodyTextStyle.fontWeight}; line-height: ${bodyTextStyle.lineHeight};`
    : `color: ${style.colors.text}; font-family: ${renderedFont(style.bodyFont)}; font-size: ${style.bodySizePt}pt; line-height: 1.5;`;
  const emphasis = style.italicStyle;
  const pageSize = style.page.size === "A4" ? "A4" : "letter";
  const fontFaceCss = assetRendering
    ? [...assetRendering.fonts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([id, asset]) =>
            `@font-face { font-family: "${fontFamily(id)}"; src: url("data:${asset.contentType};base64,${asset.base64}") format("${fontFormats.get(asset.contentType)}"); font-style: normal; font-weight: 400 700; }`,
        )
        .join("\n")
    : "";
  const logo = assetRendering?.assets.logo;
  const logoMarkup = logo
    ? `<img class="document-logo" src="data:${logo.contentType};base64,${logo.base64}" alt="">`
    : "";
  const csp = assetRendering
    ? "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"
    : "default-src 'none'; style-src 'unsafe-inline'";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
${fontFaceCss ? `${fontFaceCss}\n` : ""}@page { size: ${pageSize}; margin: ${style.page.marginTopMm}mm ${style.page.marginRightMm}mm ${style.page.marginBottomMm}mm ${style.page.marginLeftMm}mm;
${pageMarginBoxes("top", style.header, style.colors.muted)}
${pageMarginBoxes("bottom", style.footer, style.colors.muted)}
}
* { box-sizing: border-box; }
body { ${bodyCss} margin: 0; }
${logo ? ".document-logo { display: block; max-height: 24mm; max-width: 100%; object-fit: contain; margin: 0 0 6mm; }\n" : ""}main { min-height: 100%; }
${textStylesCss}
em { font-style: ${emphasis}; } a { color: ${style.colors.primary}; } blockquote { border-left: 3px solid ${style.colors.accent}; color: ${style.colors.muted}; margin-left: 0; padding-left: 1em; }
table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid ${style.colors.muted}; padding: .35em; text-align: left; } pre { overflow-wrap: anywhere; white-space: pre-wrap; }
</style>
</head>
<body>
<main>${logoMarkup}${fragment}</main>
</body>
</html>`;
}

export const inputHash = (format: DocumentFormat, body: string) =>
  createHash("sha256")
    .update(JSON.stringify([format, body]), "utf8")
    .digest("hex");

export const sourceHash = (source: string) =>
  createHash("sha256").update(source, "utf8").digest("hex");
