import { createHash } from "node:crypto";
import type { DocumentFormat, StyleDefinition } from "@hypergendoc/contracts";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export const DOCUMENT_BODY_MAX_BYTES = 256 * 1024;
export const DOCUMENT_MAX_PAGES = 100;

export type DocumentInputIssueCode =
  "body_empty" | "body_too_large" | "invalid_body" | "invalid_format";

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
    "Noto Serif": "Georgia, serif",
    "Libertinus Serif": "Georgia, serif",
  })[name];

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
): string {
  const exactBody = validateDocumentInput(format, body);
  const rendered =
    format === "markdown"
      ? marked.parse(exactBody, { async: false })
      : exactBody;
  const fragment = sanitizeFragment(rendered);
  if (!semanticText(fragment)) fail("invalid_body");

  const legacyHeadingCss = `h1, h2, h3, h4, h5, h6 { color: ${style.colors.heading}; font-family: ${font(style.headingFont)}; line-height: 1.2; }
h1 { font-size: ${(style.bodySizePt * style.headingScale).toFixed(2)}pt; } h2 { font-size: ${(style.bodySizePt * style.headingScale * 0.85).toFixed(2)}pt; }`;
  const textStyles = style.textStyles;
  const textStylesCss = textStyles
    ? textStyleRoles
        .map((role) => {
          const textStyle = textStyles[role];
          return `${role} { color: ${textStyle.color}; font-family: ${font(textStyle.fontFamily)}; font-size: ${textStyle.fontSizePt}pt; font-weight: ${textStyle.fontWeight}; line-height: ${textStyle.lineHeight}; }`;
        })
        .join("\n")
    : legacyHeadingCss;
  const emphasis = style.italicStyle;
  const pageSize = style.page.size === "A4" ? "A4" : "letter";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
@page { size: ${pageSize}; margin: ${style.page.marginTopMm}mm ${style.page.marginRightMm}mm ${style.page.marginBottomMm}mm ${style.page.marginLeftMm}mm;
${pageMarginBoxes("top", style.header, style.colors.muted)}
${pageMarginBoxes("bottom", style.footer, style.colors.muted)}
}
* { box-sizing: border-box; }
body { color: ${style.colors.text}; font-family: ${font(style.bodyFont)}; font-size: ${style.bodySizePt}pt; line-height: 1.5; margin: 0; }
main { min-height: 100%; }
${textStylesCss}
em { font-style: ${emphasis}; } a { color: ${style.colors.primary}; } blockquote { border-left: 3px solid ${style.colors.accent}; color: ${style.colors.muted}; margin-left: 0; padding-left: 1em; }
table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid ${style.colors.muted}; padding: .35em; text-align: left; } pre { overflow-wrap: anywhere; white-space: pre-wrap; }
</style>
</head>
<body>
<main>${fragment}</main>
</body>
</html>`;
}

export const inputHash = (format: DocumentFormat, body: string) =>
  createHash("sha256")
    .update(JSON.stringify([format, body]), "utf8")
    .digest("hex");

export const sourceHash = (source: string) =>
  createHash("sha256").update(source, "utf8").digest("hex");
