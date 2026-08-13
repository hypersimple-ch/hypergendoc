import { createHash } from "node:crypto";
import {
  TemplateDataSchema,
  TemplateDefinitionSchema,
  type DocumentFormat,
  type ResolvedStyleAssets,
  type ResolvedTemplateAssets,
  type StyleDefinition,
  type TemplateCondition,
  type TemplateData,
  type TemplateDefinition,
  type TemplateExpression,
  type TemplateFieldDefinition,
  type TemplateInline,
  type TemplateNode,
  type TemplateValue,
} from "@hypergendoc/contracts";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { builtInFonts } from "./built-in-fonts.js";

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

/** Validates source and canonicalizes HTML fragments before persistence. */
export function sanitizeDocumentInput(
  format: DocumentFormat,
  body: string,
): string {
  const exactBody = validateDocumentInput(format, body);
  if (format === "markdown") return exactBody;
  const sanitized = sanitizeFragment(exactBody);
  if (!semanticText(sanitized)) fail("invalid_body");
  return sanitized;
}

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
    Roboto: "Arial, sans-serif",
    Poppins: "Arial, sans-serif",
    "Nunito Sans": "Arial, sans-serif",
    Nunito: "Arial, sans-serif",
    Archivo: "Arial, sans-serif",
    Karla: "Arial, sans-serif",
    "Roboto Condensed": "Arial, sans-serif",
    "Merriweather Sans": "Arial, sans-serif",
    Ubuntu: "Arial, sans-serif",
    Oswald: "Arial, sans-serif",
    Raleway: "Arial, sans-serif",
    Figtree: "Arial, sans-serif",
    "Plus Jakarta Sans": "Arial, sans-serif",
    Outfit: "Arial, sans-serif",
    Rubik: "Arial, sans-serif",
    "Noto Serif": "Georgia, serif",
    "Libertinus Serif": "Georgia, serif",
    Fraunces: "Georgia, serif",
    Lora: "Georgia, serif",
    Merriweather: "Georgia, serif",
    "Source Serif 4": "Georgia, serif",
    "Playfair Display": "Georgia, serif",
    "Libre Baskerville": "Georgia, serif",
    "Roboto Slab": "Georgia, serif",
    "PT Serif": "Georgia, serif",
    "Crimson Pro": "Georgia, serif",
    "Cormorant Garamond": "Georgia, serif",
    "DM Serif Display": "Georgia, serif",
    Alegreya: "Georgia, serif",
    "EB Garamond": "Georgia, serif",
    "IBM Plex Mono": "Courier New, monospace",
    "Source Code Pro": "Courier New, monospace",
    "JetBrains Mono": "Courier New, monospace",
    "Fira Code": "Courier New, monospace",
    "Space Mono": "Courier New, monospace",
    "Roboto Mono": "Courier New, monospace",
    Inconsolata: "Courier New, monospace",
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
const builtInFontFamily = (id: string) =>
  `HypergendocBuiltIn_${id.replaceAll(/[^a-z0-9]/gi, "")}`;

const builtInFontFaces = (id: string) =>
  Object.hasOwn(builtInFonts, id)
    ? builtInFonts[id as keyof typeof builtInFonts]
    : undefined;

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
  fontFamily: string,
) => {
  if (!value.enabled) return "";
  return (["left", "center", "right"] as const)
    .map((alignment) => {
      const text = value[`${alignment}Text`];
      const pageNumber = alignment === "right" && value.showPageNumber;
      return `@${position}-${alignment} { color: ${mutedColor}; content: "${escapeCssString(text)}"${pageNumber ? ' " " counter(page)' : ""}; font-family: ${fontFamily}; font-size: 8pt; }`;
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
  const exactBody = sanitizeDocumentInput(format, body);
  const assetRendering =
    style.assetVersion === 1 ? resolveAssets(style, assets) : undefined;
  const rendered =
    format === "markdown"
      ? marked.parse(exactBody, { async: false })
      : exactBody;
  const fragment = sanitizeFragment(rendered);
  if (!semanticText(fragment)) fail("invalid_body");

  const fontReferences = [
    style.bodyFont,
    style.headingFont,
    ...Object.values(style.textStyles ?? {}).flatMap((textStyle) =>
      textStyle ? [textStyle.fontFamily] : [],
    ),
  ];
  const renderedFont = (reference: StyleDefinition["bodyFont"]) =>
    builtInFontFaces(reference)
      ? `"${builtInFontFamily(reference)}", ${font(reference)}`
      : assetRendering?.fonts.has(reference)
        ? `"${fontFamily(reference)}", sans-serif`
        : font(reference)!;
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
  const bodyFont = renderedFont(bodyTextStyle?.fontFamily ?? style.bodyFont);
  const bodyCss = bodyTextStyle
    ? `color: ${bodyTextStyle.color}; font-family: ${bodyFont}; font-size: ${bodyTextStyle.fontSizePt}pt; font-weight: ${bodyTextStyle.fontWeight}; line-height: ${bodyTextStyle.lineHeight};`
    : `color: ${style.colors.text}; font-family: ${bodyFont}; font-size: ${style.bodySizePt}pt; line-height: 1.5;`;
  const emphasis = style.italicStyle;
  const pageSize = style.page.size === "A4" ? "A4" : "letter";
  const builtInFontFaceCss = [...new Set(fontReferences)]
    .flatMap((id) =>
      (builtInFontFaces(id) ?? []).map(
        (face) =>
          `@font-face { font-family: "${builtInFontFamily(id)}"; src: url("data:font/woff2;base64,${face.base64}") format("woff2"); font-style: normal; font-weight: ${face.weight}; }`,
      ),
    )
    .join("\n");
  const customFontFaceCss = assetRendering
    ? [...assetRendering.fonts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([id, asset]) =>
            `@font-face { font-family: "${fontFamily(id)}"; src: url("data:${asset.contentType};base64,${asset.base64}") format("${fontFormats.get(asset.contentType)}"); font-style: normal; font-weight: 400 700; }`,
        )
        .join("\n")
    : "";
  const fontFaceCss = [builtInFontFaceCss, customFontFaceCss]
    .filter(Boolean)
    .join("\n");
  const logo = assetRendering?.assets.logo;
  const logoMarkup = logo
    ? `<img class="document-logo" src="data:${logo.contentType};base64,${logo.base64}" alt="">`
    : "";
  const csp =
    assetRendering || builtInFontFaceCss
      ? "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"
      : "default-src 'none'; style-src 'unsafe-inline'";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
${fontFaceCss ? `${fontFaceCss}\n` : ""}@page { size: ${pageSize}; margin: ${style.page.marginTopMm}mm ${style.page.marginRightMm}mm ${style.page.marginBottomMm}mm ${style.page.marginLeftMm}mm;
${pageMarginBoxes("top", style.header, style.colors.muted, bodyFont)}
${pageMarginBoxes("bottom", style.footer, style.colors.muted, bodyFont)}
}
* { box-sizing: border-box; }
body { ${bodyCss} margin: 0; }
${logo ? ".document-logo { display: block; max-height: 24mm; max-width: 100%; object-fit: contain; margin: 0 0 6mm; }\n" : ""}main { min-height: 100%; }
${textStylesCss}
em { font-style: ${emphasis}; } a { color: ${style.colors.primary}; } blockquote { border-left: 3px solid ${style.colors.accent}; color: ${style.colors.muted}; margin-left: 0; padding-left: 1em; }
h1, h2, h3, h4, h5, h6, caption { break-after: avoid-page; } table, blockquote, pre { break-inside: avoid-page; } thead { display: table-header-group; } tr { break-inside: avoid-page; }
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

export interface RenderTemplateDocumentInput {
  readonly definition: TemplateDefinition;
  readonly data: TemplateData;
  readonly style: StyleDefinition;
  readonly styleAssets?: ResolvedStyleAssets;
  readonly templateAssets?: ResolvedTemplateAssets;
  readonly locale?: string;
}

const TEMPLATE_MAX_DEPTH = 32;
const TEMPLATE_MAX_EXPANDED_NODES = 5_000;
const TEMPLATE_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const htmlEscape = (value: unknown) =>
  (value === null || value === undefined
    ? ""
    : typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ? String(value)
      : JSON.stringify(value)
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const isTemplateRecord = (
  value: unknown,
): value is Record<string, TemplateValue> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const templatePath = (
  root: Readonly<Record<string, TemplateValue>>,
  locals: Readonly<Record<string, TemplateValue>>,
  path: string,
): TemplateValue | undefined => {
  const parts = path
    .replace(/^\$\.?/, "")
    .split(".")
    .filter(Boolean);
  if (
    !parts.length ||
    parts.some(
      (part) =>
        part === "__proto__" || part === "constructor" || part === "prototype",
    )
  )
    return undefined;
  let value: TemplateValue | undefined = Object.hasOwn(locals, parts[0]!)
    ? locals[parts.shift()!]
    : root[parts.shift()!];
  for (const part of parts) {
    if (Array.isArray(value) && /^\d+$/.test(part))
      value = (value as readonly TemplateValue[])[Number(part)];
    else if (isTemplateRecord(value)) value = value[part];
    else return undefined;
  }
  return value;
};

const matchesTemplateField = (
  field: TemplateFieldDefinition,
  value: TemplateValue | undefined,
  depth = 0,
): boolean => {
  if (depth > TEMPLATE_MAX_DEPTH) return false;
  if (value === undefined || value === null) return !field.required;
  if (
    field.options &&
    typeof value === "string" &&
    !field.options.includes(value)
  )
    return false;
  switch (field.type) {
    case "text":
    case "richText":
    case "date":
      return typeof value === "string";
    case "image":
      return typeof value === "string" && uuidPattern.test(value);
    case "number":
    case "money":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return Boolean(
        field.fields &&
        isTemplateRecord(value) &&
        Object.keys(value).every((key) => key in field.fields!) &&
        Object.entries(field.fields).every(([key, child]) =>
          matchesTemplateField(child, value[key], depth + 1),
        ),
      );
    case "list":
      return Boolean(
        field.item &&
        Array.isArray(value) &&
        value.length <= 500 &&
        (value as readonly TemplateValue[]).every((item) =>
          matchesTemplateField(field.item!, item, depth + 1),
        ),
      );
  }
};

const templateFieldDefaults = (
  field: TemplateFieldDefinition,
  value: TemplateValue | undefined,
  depth = 0,
): TemplateValue | undefined => {
  if (depth > TEMPLATE_MAX_DEPTH) fail("invalid_body");
  const resolved = value === undefined ? field.default : value;
  if (resolved === undefined || resolved === null) return resolved;
  if (field.type === "object" && field.fields && isTemplateRecord(resolved)) {
    const record: Record<string, TemplateValue> = { ...resolved };
    for (const [key, child] of Object.entries(field.fields)) {
      const childValue = templateFieldDefaults(child, record[key], depth + 1);
      if (childValue !== undefined) record[key] = childValue;
    }
    return record;
  }
  if (field.type === "list" && field.item && Array.isArray(resolved)) {
    const itemDefinition = field.item;
    return (resolved as readonly TemplateValue[]).map(
      (item) => templateFieldDefaults(itemDefinition, item, depth + 1) ?? null,
    );
  }
  return resolved;
};

const validateTemplateData = (
  definition: TemplateDefinition,
  data: TemplateData,
): Readonly<Record<string, TemplateValue>> => {
  const parsedDefinition = TemplateDefinitionSchema.safeParse(definition);
  const parsedData = TemplateDataSchema.safeParse(data);
  if (!parsedDefinition.success || !parsedData.success) fail("invalid_body");
  const parsedDefinitionData = parsedDefinition.data as TemplateDefinition;
  const parsedTemplateData = parsedData.data as TemplateData;
  if (!parsedDefinitionData || !parsedTemplateData) fail("invalid_body");
  const allowed = new Set(Object.keys(parsedDefinitionData.fields));
  if (Object.keys(parsedTemplateData).some((key) => !allowed.has(key)))
    fail("invalid_body");
  const withDefaults: Record<string, TemplateValue> = { ...parsedTemplateData };
  for (const [key, field] of Object.entries(parsedDefinitionData.fields)) {
    const value = templateFieldDefaults(field, withDefaults[key]);
    if (value !== undefined) withDefaults[key] = value;
    if (!matchesTemplateField(field, value)) fail("invalid_body");
  }
  return withDefaults;
};

export function templateImageIds(
  definition: TemplateDefinition,
  data: TemplateData,
): readonly string[] {
  const root = validateTemplateData(definition, data);
  const ids = new Set<string>();
  const collect = (
    field: TemplateFieldDefinition,
    value: TemplateValue | undefined,
    depth: number,
  ) => {
    if (depth > TEMPLATE_MAX_DEPTH || value === undefined || value === null)
      return;
    if (field.type === "image" && typeof value === "string") ids.add(value);
    else if (field.type === "object" && field.fields && isTemplateRecord(value))
      for (const [key, child] of Object.entries(field.fields))
        collect(child, value[key], depth + 1);
    else if (field.type === "list" && field.item && Array.isArray(value))
      for (const item of value as readonly TemplateValue[])
        collect(field.item, item, depth + 1);
  };
  for (const [key, field] of Object.entries(definition.fields))
    collect(field, root[key], 0);
  return [...ids].sort();
}

const evaluateTemplateExpression = (
  expression: TemplateExpression,
  root: Readonly<Record<string, TemplateValue>>,
): TemplateValue => {
  if (expression.op === "value") return expression.value;
  if (expression.op === "path")
    return templatePath(root, {}, expression.path) ?? null;
  if (expression.op === "sum") {
    const values = templatePath(root, {}, expression.path);
    return Array.isArray(values)
      ? (values as readonly TemplateValue[]).reduce<number>((total, value) => {
          const number =
            expression.valuePath && isTemplateRecord(value)
              ? templatePath(value, {}, expression.valuePath)
              : value;
          return total + (typeof number === "number" ? number : 0);
        }, 0)
      : 0;
  }
  if (expression.op === "count") {
    const values = templatePath(root, {}, expression.path);
    return Array.isArray(values)
      ? values.length
      : isTemplateRecord(values)
        ? Object.keys(values).length
        : 0;
  }
  if (expression.op === "dateAdd") {
    const value = templatePath(root, {}, expression.path);
    const days = evaluateTemplateExpression(expression.days, root);
    if (typeof value !== "string" || typeof days !== "number") return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.valueOf())) return null;
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  const left = evaluateTemplateExpression(expression.left, root);
  const right = evaluateTemplateExpression(expression.right, root);
  if (typeof left !== "number" || typeof right !== "number") return null;
  if (expression.op === "add") return left + right;
  if (expression.op === "subtract") return left - right;
  if (expression.op === "multiply") return left * right;
  return right === 0 ? null : left / right;
};

const templateConditionMatches = (
  condition: TemplateCondition,
  root: Readonly<Record<string, TemplateValue>>,
  locals: Readonly<Record<string, TemplateValue>>,
): boolean => {
  const actual = templatePath(root, locals, condition.path);
  const expected = condition.value;
  switch (condition.operator) {
    case "truthy":
      return Boolean(actual);
    case "falsy":
      return !actual;
    case "equals":
      return actual === expected;
    case "notEquals":
      return actual !== expected;
    case "contains":
      return Array.isArray(actual)
        ? actual.includes(expected ?? null)
        : typeof actual === "string" && typeof expected === "string"
          ? actual.includes(expected)
          : false;
    case "gt":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual > expected
      );
    case "gte":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual >= expected
      );
    case "lt":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual < expected
      );
    case "lte":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual <= expected
      );
  }
};

const templateDisplayValue = (
  value: TemplateValue | undefined,
  format: TemplateInline["format"] | "text" | undefined,
  currency: string | undefined,
  locale: string,
): string => {
  if (value === undefined || value === null) return "";
  if (format === "date" && typeof value === "string") {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.valueOf())
      ? value
      : new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeZone: "UTC",
        }).format(date);
  }
  if ((format === "number" || format === "money") && typeof value === "number")
    return new Intl.NumberFormat(
      locale,
      format === "money"
        ? { style: "currency", currency: currency ?? "USD" }
        : {},
    ).format(value);
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : JSON.stringify(value);
};

const templateColor = (
  reference: string | undefined,
  style: StyleDefinition,
) =>
  reference?.startsWith("#")
    ? reference
    : (style.colors[(reference as keyof StyleDefinition["colors"]) ?? "text"] ??
      style.colors.text);

/** Compiles a versioned user template with typed data into deterministic, trusted standalone HTML. */
export function renderTemplateDocumentHtml(
  input: RenderTemplateDocumentInput,
): string {
  const baseData = validateTemplateData(input.definition, input.data);
  const root: Record<string, TemplateValue> = { ...baseData };
  const computed = input.definition.computed ?? {};
  const computedDependencies = (expression: TemplateExpression): string[] => {
    switch (expression.op) {
      case "value":
        return [];
      case "path":
      case "count":
      case "sum":
        return [expression.path.split(".")[0]!];
      case "dateAdd":
        return [
          expression.path.split(".")[0]!,
          ...computedDependencies(expression.days),
        ];
      case "add":
      case "subtract":
      case "multiply":
      case "divide":
        return [
          ...computedDependencies(expression.left),
          ...computedDependencies(expression.right),
        ];
    }
  };
  const resolvedComputed = new Set<string>();
  const resolvingComputed = new Set<string>();
  const resolveComputed = (key: string): void => {
    if (resolvedComputed.has(key)) return;
    if (resolvingComputed.has(key)) fail("invalid_body");
    const expression = computed[key] ?? fail("invalid_body");
    resolvingComputed.add(key);
    for (const dependency of computedDependencies(expression))
      if (computed[dependency]) resolveComputed(dependency);
    root[key] = evaluateTemplateExpression(expression, root);
    resolvingComputed.delete(key);
    resolvedComputed.add(key);
  };
  for (const key of Object.keys(computed)) resolveComputed(key);
  const locale = input.locale ?? "en";
  const imageAssets = new Map<
    string,
    NonNullable<ResolvedTemplateAssets>["images"][number]
  >();
  let imageBytes =
    (input.styleAssets?.logo?.byteSize ?? 0) +
    (input.styleAssets?.fonts ?? []).reduce(
      (total, fontAsset) => total + fontAsset.byteSize,
      0,
    );
  for (const asset of input.templateAssets?.images ?? []) {
    if (imageAssets.has(asset.id) || !logoTypes.has(asset.contentType))
      fail("invalid_assets");
    const bytes = decodedAsset(asset);
    imageBytes += bytes.byteLength;
    if (
      asset.byteSize > TEMPLATE_MAX_IMAGE_BYTES ||
      imageBytes > MAX_RENDER_ASSET_BYTES
    )
      fail("invalid_assets");
    imageAssets.set(asset.id, asset);
  }
  if (input.style.logoObjectId && input.styleAssets?.logo)
    imageAssets.set(input.style.logoObjectId, input.styleAssets.logo);

  type Heading = { id: string; level: number; text: string };
  const collectHeadings: Heading[] = [];
  let expandedNodes = 0;
  let generatedId = 0;

  const inlineText = (
    inline: readonly TemplateInline[] | undefined,
    locals: Readonly<Record<string, TemplateValue>>,
    markup: boolean,
  ) =>
    (inline ?? [])
      .map((part) => {
        const raw =
          part.type === "binding"
            ? templateDisplayValue(
                templatePath(root, locals, part.path ?? ""),
                part.format,
                part.currency,
                locale,
              )
            : (part.value ?? "");
        let value = htmlEscape(raw);
        if (!markup) return raw;
        if (part.strong) value = `<strong>${value}</strong>`;
        if (part.emphasis) value = `<em>${value}</em>`;
        if (part.color)
          value = `<span class="template-color-${part.color}">${value}</span>`;
        return value;
      })
      .join("");

  const renderPass = (
    nodes: readonly TemplateNode[],
    headings: readonly Heading[],
    collecting: boolean,
  ): string => {
    expandedNodes = 0;
    generatedId = 0;
    const renderNodes = (
      values: readonly TemplateNode[],
      locals: Readonly<Record<string, TemplateValue>>,
      depth: number,
    ): string => {
      if (depth > TEMPLATE_MAX_DEPTH) fail("invalid_body");
      return values
        .map((node) => {
          expandedNodes += 1;
          if (expandedNodes > TEMPLATE_MAX_EXPANDED_NODES)
            fail("body_too_large");
          switch (node.type) {
            case "page": {
              const master =
                node.master ??
                Object.keys(input.definition.pageMasters)[0] ??
                fail("invalid_body");
              const pageMaster =
                input.definition.pageMasters[master] ?? fail("invalid_body");
              const pageHeightMm = input.style.page.size === "A4" ? 297 : 279.4;
              const pageWidthMm = input.style.page.size === "A4" ? 210 : 215.9;
              const contentHeightMm = Math.max(
                1,
                Math.round(
                  (pageHeightMm -
                    (pageMaster.marginTopMm ?? input.style.page.marginTopMm) -
                    (pageMaster.marginBottomMm ??
                      input.style.page.marginBottomMm)) *
                    1_000,
                ) / 1_000,
              );
              const contentWidthMm = Math.max(
                1,
                Math.round(
                  (pageWidthMm -
                    (pageMaster.marginLeftMm ?? input.style.page.marginLeftMm) -
                    (pageMaster.marginRightMm ??
                      input.style.page.marginRightMm)) *
                    1_000,
                ) / 1_000,
              );
              return `<section class="template-page template-master-${htmlEscape(master)}" data-page-content-mm="${contentHeightMm}" data-page-width-mm="${contentWidthMm}" data-page-start="${pageMaster.startOn ?? "any"}">${renderNodes(node.children ?? [], locals, depth + 1)}</section>`;
            }
            case "section": {
              const id = node.id ?? `section-${++generatedId}`;
              return `<section id="${htmlEscape(id)}" class="template-section">${renderNodes(node.children ?? [], locals, depth + 1)}</section>`;
            }
            case "stack":
              return `<div class="template-stack" style="--template-gap:${node.gapMm ?? 4}mm">${renderNodes(node.children ?? [], locals, depth + 1)}</div>`;
            case "grid":
              return `<div class="template-grid" style="--template-columns:${node.columns ?? 2};--template-gap:${node.gapMm ?? 4}mm">${renderNodes(node.children ?? [], locals, depth + 1)}</div>`;
            case "heading": {
              const level = node.level ?? 2;
              const text = inlineText(node.content, locals, false);
              const id = node.id ?? `heading-${++generatedId}`;
              if (collecting) collectHeadings.push({ id, level, text });
              return `<h${level} id="${htmlEscape(id)}">${inlineText(node.content, locals, true)}</h${level}>`;
            }
            case "paragraph":
              return `<p>${inlineText(node.content, locals, true)}</p>`;
            case "richText": {
              const value = templatePath(root, locals, node.source ?? "");
              return `<div class="template-rich-text">${typeof value === "string" ? sanitizeFragment(value) : ""}</div>`;
            }
            case "image": {
              const value =
                node.source && uuidPattern.test(node.source)
                  ? node.source
                  : templatePath(root, locals, node.source ?? "");
              if (typeof value !== "string") return "";
              const asset = imageAssets.get(value);
              if (!asset) return fail("invalid_assets");
              const alt = node.altPath
                ? templateDisplayValue(
                    templatePath(root, locals, node.altPath),
                    "text",
                    undefined,
                    locale,
                  )
                : "";
              const caption = node.caption?.length
                ? `<figcaption>${inlineText(node.caption, locals, true)}</figcaption>`
                : "";
              return `<figure class="template-image"><img src="data:${asset.contentType};base64,${asset.base64}" alt="${htmlEscape(alt)}" style="object-fit:${node.fit ?? "cover"}${node.heightMm === undefined ? "" : `;height:${node.heightMm}mm`}">${caption}</figure>`;
            }
            case "list": {
              const value = templatePath(
                root,
                locals,
                node.itemsPath ?? node.source ?? "",
              );
              const items: readonly TemplateValue[] = Array.isArray(value)
                ? (value as readonly TemplateValue[])
                : [];
              const tag = node.ordered ? "ol" : "ul";
              return `<${tag}>${items.map((item) => `<li>${htmlEscape(templateDisplayValue(item, "text", undefined, locale))}</li>`).join("")}</${tag}>`;
            }
            case "table": {
              const value = templatePath(root, locals, node.source ?? "");
              const rows = Array.isArray(value) ? value : [];
              const columns = node.tableColumns ?? [];
              return `<table><thead><tr>${columns.map((column) => `<th style="text-align:${column.align ?? "left"}">${htmlEscape(column.header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td style="text-align:${column.align ?? "left"}">${htmlEscape(templateDisplayValue(isTemplateRecord(row) ? templatePath(row, {}, column.path) : undefined, column.format, column.currency, locale))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
            }
            case "repeat": {
              const value = templatePath(root, locals, node.source ?? "");
              if (!Array.isArray(value)) return "";
              const alias = node.as ?? "item";
              return (value as readonly TemplateValue[])
                .map((item, index) =>
                  renderNodes(
                    node.children ?? [],
                    { ...locals, [alias]: item, index },
                    depth + 1,
                  ),
                )
                .join("");
            }
            case "condition":
              return node.condition &&
                templateConditionMatches(node.condition, root, locals)
                ? renderNodes(node.children ?? [], locals, depth + 1)
                : "";
            case "component": {
              const component =
                input.definition.components?.[node.component ?? ""];
              if (!component) return fail("invalid_body");
              return renderNodes(
                component,
                { ...locals, props: node.props ?? {} },
                depth + 1,
              );
            }
            case "toc":
              return `<nav class="template-toc" aria-label="Table of contents"><ol>${headings
                .filter((heading) => heading.level <= (node.tocDepth ?? 3))
                .map(
                  (heading) =>
                    `<li class="template-toc-level-${heading.level}"><a href="#${htmlEscape(heading.id)}"><span>${htmlEscape(heading.text)}</span><span class="template-toc-leader"></span><span class="template-toc-page"></span></a></li>`,
                )
                .join("")}</ol></nav>`;
            case "pageBreak":
              return `<div class="template-page-break"></div>`;
            case "spacer":
              return `<div class="template-spacer" style="height:${node.heightMm ?? 4}mm"></div>`;
            case "divider":
              return `<hr>`;
          }
        })
        .join("");
    };
    return renderNodes(nodes, {}, 0);
  };

  renderPass(input.definition.document, [], true);
  generatedId = 0;
  expandedNodes = 0;
  const body = renderPass(input.definition.document, collectHeadings, false);
  if (Buffer.byteLength(body, "utf8") > DOCUMENT_BODY_MAX_BYTES * 4)
    fail("body_too_large");

  const masterCss = Object.entries(input.definition.pageMasters)
    .map(([name, master]) => {
      const margins: readonly [number, number, number, number] = [
        master.marginTopMm ?? input.style.page.marginTopMm,
        master.marginRightMm ?? input.style.page.marginRightMm,
        master.marginBottomMm ?? input.style.page.marginBottomMm,
        master.marginLeftMm ?? input.style.page.marginLeftMm,
      ];
      const pageHeightMm = input.style.page.size === "A4" ? 297 : 279.4;
      const pageWidthMm = input.style.page.size === "A4" ? 210 : 215.9;
      const contentHeightMm = Math.max(
        1,
        Math.round((pageHeightMm - margins[0] - margins[2]) * 1_000) / 1_000,
      );
      const contentWidthMm = Math.max(
        1,
        Math.round((pageWidthMm - margins[1] - margins[3]) * 1_000) / 1_000,
      );
      const hiddenMarginBoxes = [
        ...(master.hideHeader ? ["top-left", "top-center", "top-right"] : []),
        ...(master.hideFooter
          ? ["bottom-left", "bottom-center", "bottom-right"]
          : []),
      ]
        .map((box) => `@${box}{content:none;}`)
        .join("");
      const edge = master.edgeBar
        ? `.template-master-${name}::after{content:"";position:absolute;top:0;bottom:0;width:${master.edgeBar.widthMm}mm;background:${templateColor(master.edgeBar.color, input.style)};${master.edgeBar.side === "left" ? "left:0" : "right:0"};}${master.edgeBar.side === "outside" ? `.template-page:nth-of-type(even).template-master-${name}::after{left:0;right:auto;}` : ""}`
        : "";
      return `@page ${name}{size:${input.style.page.size === "A4" ? "A4" : "letter"};margin:${margins.map((value) => `${value}mm`).join(" ")};${hiddenMarginBoxes}}${master.startOn === "recto" ? `.template-master-${name}{break-before:right;}` : master.startOn === "verso" ? `.template-master-${name}{break-before:left;}` : ""}.template-master-${name}{page:${name};width:${contentWidthMm}mm;min-height:${contentHeightMm}mm;background:${templateColor(master.background, input.style)};color:${templateColor(master.color, input.style)};}${edge}`;
    })
    .join("\n");
  const templateCss = `${masterCss}
.template-page{position:relative;break-after:page;}
.template-page:last-child{break-after:auto;}
.template-stack{display:flex;flex-direction:column;gap:var(--template-gap);}
.template-grid{display:grid;grid-template-columns:repeat(var(--template-columns),minmax(0,1fr));gap:var(--template-gap);}
.template-image{margin:0;break-inside:avoid-page;}.template-image img{display:block;width:100%;max-height:220mm;}.template-image figcaption{margin-top:2mm;font-size:8pt;color:${input.style.colors.muted};}
.template-page-break{break-after:page;}.template-rich-text>:first-child{margin-top:0;}.template-rich-text>:last-child{margin-bottom:0;}
.template-toc ol{list-style:none;padding:0;}.template-toc li{margin:.35em 0;}.template-toc a{display:flex;color:inherit;text-decoration:none;gap:.5em;}.template-toc-leader{flex:1;border-bottom:1px dotted currentColor;transform:translateY(-.25em);}.template-toc-page{min-width:2ch;text-align:right;}
.template-color-text{color:${input.style.colors.text}}.template-color-heading{color:${input.style.colors.heading}}.template-color-primary{color:${input.style.colors.primary}}.template-color-accent{color:${input.style.colors.accent}}.template-color-muted{color:${input.style.colors.muted}}
`;
  const placeholder = "HYPERGENDOC_TEMPLATE_PLACEHOLDER_7D38";
  let shell = renderDocumentHtml(
    `<p>${placeholder}</p>`,
    "html",
    input.style,
    input.styleAssets,
  );
  shell = shell.replace(/<img class="document-logo"[^>]*>/, "");
  shell = shell.replace(`<p>${placeholder}</p>`, body);
  shell = shell.replace("</style>", `${templateCss}</style>`);
  shell = shell.replace(
    "default-src 'none'; style-src",
    "default-src 'none'; img-src data:; style-src",
  );
  shell = shell.replace(
    '<html lang="en">',
    `<html lang="${htmlEscape(locale.split("-")[0] ?? "en")}">`,
  );
  return shell;
}
