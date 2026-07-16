import { createHash } from "node:crypto";
import type { StyleDefinition } from "@hypergendoc/contracts";

export const LATEX_SUBSET_VERSION = "v1" as const;
export const LATEX_BODY_MAX_BYTES = 256 * 1024;
export const LATEX_MAX_DEPTH = 12;
export const LATEX_MAX_NODES = 4_000;
export const LATEX_MAX_TABLE_ROWS = 100;
export const LATEX_MAX_TABLE_COLUMNS = 12;
export const LATEX_MAX_URL_LENGTH = 2_048;
export const LATEX_MAX_PAGES = 100;

export type LatexIssueCode =
  | "body_too_large"
  | "invalid_encoding"
  | "comment_not_allowed"
  | "unknown_command"
  | "unknown_environment"
  | "forbidden_construct"
  | "malformed_syntax"
  | "nesting_limit"
  | "node_limit"
  | "table_limit"
  | "url_not_allowed"
  | "url_too_long"
  | "text_not_escaped";

export class LatexSubsetError extends Error {
  constructor(public readonly code: LatexIssueCode) {
    super(code);
    this.name = "LatexSubsetError";
  }
}

const fail = (code: LatexIssueCode): never => {
  throw new LatexSubsetError(code);
};
const bytes = (value: string) => Buffer.byteLength(value, "utf8");
const forbidden =
  /(?:input|include|usepackage|documentclass|begin|end|def|gdef|edef|xdef|let|catcode|csname|expandafter|write|read|openin|openout|immediate|special|directlua|luaexec|shellescape|inputenc|url|verb|par|every|shipout|pdf|file|pipe|socket|loop|newcommand|renewcommand|makeatletter)/i;

function hasInvalidCodePoint(value: string): boolean {
  for (const char of value) {
    const codePoint = char.codePointAt(0)!;
    if (
      codePoint === 0xfffd ||
      codePoint <= 0x08 ||
      (codePoint >= 0x0b && codePoint <= 0x0c) ||
      (codePoint >= 0x0e && codePoint <= 0x1f) ||
      codePoint === 0x7f ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    )
      return true;
  }
  return false;
}

function assertInput(value: string): void {
  if (bytes(value) > LATEX_BODY_MAX_BYTES) fail("body_too_large");
  if (/(^|[^\\])(?:\\\\)*%/.test(value)) fail("comment_not_allowed");
  if (hasInvalidCodePoint(value)) fail("invalid_encoding");
  // A backslash followed by a non-ASCII letter is not an allowed TeX control word.
  if (/\\[^A-Za-z\\{}%$#&_\s]/.test(value)) fail("malformed_syntax");
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

/** Parses inline content and emits canonical TeX. Raw TeX metacharacters are never copied. */
function inline(value: string, depth = 0): string {
  if (depth > LATEX_MAX_DEPTH) fail("nesting_limit");
  let out = "";
  for (let i = 0; i < value.length;) {
    const char = value[i]!;
    if (char === "\\") {
      const match = /^\\([A-Za-z]+|[\\{}%$#&_])/.exec(value.slice(i));
      if (!match) fail("malformed_syntax");
      const command = match![1]!;
      i += match![0].length;
      if (/^[\\{}%$#&_]$/.test(command)) {
        out += escapeText(command);
        continue;
      }
      if (forbidden.test(command)) fail("forbidden_construct");
      if (command !== "textbf" && command !== "emph" && command !== "href")
        fail("unknown_command");
      const first = group(value, i);
      i = first.next;
      if (command === "href") {
        const second = group(value, i);
        i = second.next;
        const url = first.value.trim();
        if (bytes(url) > LATEX_MAX_URL_LENGTH) fail("url_too_long");
        if (
          !/^(https:\/\/[^\s{}\\]+|mailto:[^\s{}\\@]+@[^\s{}\\@]+)$/.test(url)
        )
          fail("url_not_allowed");
        out += `\\href{${url}}{${inline(second.value, depth + 1)}}`;
      } else out += `\\${command}{${inline(first.value, depth + 1)}}`;
      continue;
    }
    if ("{}#$%&_~^".includes(char)) fail("text_not_escaped");
    if (char === "\n" || char === "\r" || char === "\t") {
      out += " ";
      i++;
      continue;
    }
    out += escapeText(char);
    i++;
  }
  return out.replace(/ {2,}/g, " ").trim();
}

function group(value: string, at: number): { value: string; next: number } {
  if (value[at] !== "{") fail("malformed_syntax");
  let depth = 1;
  for (let i = at + 1; i < value.length; i++) {
    if (value[i] === "\\") {
      i++;
      continue;
    }
    if (value[i] === "{") depth++;
    if (value[i] === "}" && --depth === 0)
      return { value: value.slice(at + 1, i), next: i + 1 };
    if (depth > LATEX_MAX_DEPTH) fail("nesting_limit");
  }
  return fail("malformed_syntax");
}

function table(value: string): string {
  const match = /^\s*\{([lcr]{1,12})\}/.exec(value);
  if (!match) fail("malformed_syntax");
  const columns = match![1]!.length;
  const content = value.slice(match![0].length).trim();
  const rows = content ? content.split(/\\\\/).map((row) => row.trim()) : [];
  if (!rows.length || rows.length > LATEX_MAX_TABLE_ROWS) fail("table_limit");
  const normalized = rows.map((row) => {
    const cells = row.split("&");
    if (cells.length !== columns || cells.length > LATEX_MAX_TABLE_COLUMNS)
      fail("table_limit");
    return cells.map((cell) => inline(cell)).join(" & ");
  });
  return `\\begin{tabular}{${match![1]}}\n${normalized.join(" \\\\\n")}\n\\end{tabular}`;
}

/**
 * Validate and canonicalize the deliberately small document language. It is a
 * parser, not a sanitizer: unsupported TeX is rejected rather than preserved.
 */
export function normalizeLatexBody(input: string): string {
  assertInput(input);
  let nodes = 0;
  const count = () => {
    if (++nodes > LATEX_MAX_NODES) fail("node_limit");
  };
  const parse = (source: string, depth = 0): string => {
    if (depth > LATEX_MAX_DEPTH) fail("nesting_limit");
    let rest = source.trim();
    const blocks: string[] = [];
    while (rest) {
      count();
      const command = /^\\(section|subsection|newpage)\b/.exec(rest);
      if (command) {
        rest = rest.slice(command[0].length);
        if (command[1] === "newpage") {
          blocks.push("\\newpage");
          continue;
        }
        const title = group(rest, 0);
        rest = rest.slice(title.next);
        blocks.push(`\\${command[1]}{${inline(title.value, depth + 1)}}`);
        continue;
      }
      const env = /^\\begin\{(itemize|enumerate|quote|tabular)\}/.exec(rest);
      if (env) {
        rest = rest.slice(env[0].length);
        const end = `\\end{${env[1]}}`;
        const endAt = rest.indexOf(end);
        if (endAt < 0 || rest.slice(0, endAt).includes("\\begin"))
          fail("unknown_environment");
        const contents = rest.slice(0, endAt);
        rest = rest.slice(endAt + end.length).trim();
        if (env[1] === "tabular") {
          blocks.push(table(contents));
          continue;
        }
        if (env[1] === "quote") {
          blocks.push(
            `\\begin{quote}\n${inline(contents, depth + 1)}\n\\end{quote}`,
          );
          continue;
        }
        const items = contents
          .trim()
          .split(/\\item\b/)
          .slice(1);
        if (!items.length || /^\s*[^\\]/.test(contents) || items.length > 200)
          fail("malformed_syntax");
        blocks.push(
          `\\begin{${env[1]}}\n${items.map((item) => `\\item ${inline(item, depth + 1)}`).join("\n")}\n\\end{${env[1]}}`,
        );
        continue;
      }
      if (/^\\(?:begin|end)\b/.test(rest)) fail("unknown_environment");
      const word = /^\\([A-Za-z]+)/.exec(rest)?.[1];
      if (word && !["textbf", "emph", "href"].includes(word))
        fail(forbidden.test(word) ? "forbidden_construct" : "unknown_command");
      const next = rest.search(
        /\n\s*\n|\\(?:section|subsection|newpage|begin|end)\b/,
      );
      const paragraph = next < 0 ? rest : rest.slice(0, next);
      if (!paragraph.trim()) {
        rest = rest.slice(Math.max(1, next));
        continue;
      }
      blocks.push(inline(paragraph, depth + 1));
      rest = next < 0 ? "" : rest.slice(next).trim();
    }
    return blocks.join("\n\n");
  };
  const result = parse(input);
  if (!result) fail("malformed_syntax");
  return result.endsWith("\n") ? result : `${result}\n`;
}

export const sourceHash = (source: string) =>
  createHash("sha256").update(source).digest("hex");

// Docker installs fonts-dejavu-core; style choices map only to those known fonts.
const font = (name: StyleDefinition["bodyFont"]) =>
  ({
    Inter: "DejaVu Sans",
    "IBM Plex Sans": "DejaVu Sans Condensed",
    "Source Sans 3": "DejaVu Sans Mono",
    "Noto Sans": "DejaVu Sans",
    "Noto Serif": "DejaVu Serif",
    "Libertinus Serif": "DejaVu Serif Condensed",
  })[name];
const plain = (value: string) => escapeText(value.replace(/[\r\n\t]+/g, " "));

/** Builds the complete server-owned source; style data is values, never TeX. */
export function wrapLatexDocument(
  body: string,
  style: StyleDefinition,
): string {
  const normalized = normalizeLatexBody(body);
  const header = style.header.enabled
    ? [
        style.header.leftText,
        style.header.centerText,
        style.header.rightText,
      ].map(plain)
    : ["", "", ""];
  const footer = style.footer.enabled
    ? [
        style.footer.leftText,
        style.footer.centerText,
        style.footer.rightText,
      ].map(plain)
    : ["", "", ""];
  if (style.header.showPageNumber) header[2] = `${header[2]}\\quad\\thepage`;
  if (style.footer.showPageNumber) footer[2] = `${footer[2]}\\quad\\thepage`;
  const paperSize = style.page.size === "A4" ? "a4paper" : "letterpaper";
  const headingSize = (style.bodySizePt * style.headingScale).toFixed(2);
  const subheadingSize = (style.bodySizePt * style.headingScale * 0.85).toFixed(
    2,
  );
  const emphasisShape = style.italicStyle === "italic" ? "it" : "sl";
  // Deliberately no object ID/path is interpolated: binary logo delivery needs
  // a separate server-owned asset contract before this hook can render it.
  const logoHook = style.logoObjectId ? "\\fbox{\\scriptsize Logo}" : "";
  return `\\documentclass[${style.bodySizePt}pt]{article}
\\usepackage[${paperSize},top=${style.page.marginTopMm}mm,right=${style.page.marginRightMm}mm,bottom=${style.page.marginBottomMm}mm,left=${style.page.marginLeftMm}mm]{geometry}
\\usepackage{xcolor,hyperref,tabularx,fontspec,titlesec,fancyhdr}
\\definecolor{HGText}{HTML}{${style.colors.text.replace("#", "")}}
\\definecolor{HGHeading}{HTML}{${style.colors.heading.replace("#", "")}}
\\definecolor{HGPrimary}{HTML}{${style.colors.primary.replace("#", "")}}
\\definecolor{HGAccent}{HTML}{${style.colors.accent.replace("#", "")}}
\\definecolor{HGMuted}{HTML}{${style.colors.muted.replace("#", "")}}
\\hypersetup{colorlinks=true,urlcolor=HGPrimary}
\\setmainfont{${font(style.bodyFont)}}
\\newfontfamily\\HGHeadingFont{${font(style.headingFont)}}
\\newcommand{\\HGLogoAsset}{${logoHook}}
\\newcount\\HGPageCount
\\AddToHook{shipout/before}{\\global\\advance\\HGPageCount by 1\\relax\\ifnum\\HGPageCount>${LATEX_MAX_PAGES}\\relax\\GenericError{}{HyperGenDoc page limit exceeded}{}{}\\fi}
\\renewcommand{\\emph}[1]{{\\fontshape{${emphasisShape}}\\selectfont #1}}
\\titleformat{\\section}{\\HGHeadingFont\\color{HGHeading}\\bfseries\\fontsize{${headingSize}pt}{${(Number(headingSize) * 1.2).toFixed(2)}pt}\\selectfont}{}{0pt}{}
\\titleformat{\\subsection}{\\HGHeadingFont\\color{HGHeading}\\bfseries\\fontsize{${subheadingSize}pt}{${(Number(subheadingSize) * 1.2).toFixed(2)}pt}\\selectfont}{}{0pt}{}
\\pagestyle{fancy}\\fancyhf{}
\\lhead{${header[0]}}\\chead{${header[1]}}\\rhead{${header[2]}}
\\lfoot{${footer[0]}}\\cfoot{${footer[1]}}\\rfoot{${footer[2]}}
\\begin{document}\\color{HGText}
${logoHook ? "\\noindent\\HGLogoAsset\\par\n" : ""}${normalized}\\end{document}
`;
}
