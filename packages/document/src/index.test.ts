import { describe, expect, it } from "vitest";
import {
  DOCUMENT_BODY_MAX_BYTES,
  DocumentInputError,
  inputHash,
  renderDocumentHtml,
  sourceHash,
  validateDocumentInput,
} from "./index.js";

const style = {
  logoObjectId: null,
  bodyFont: "Inter",
  headingFont: "Noto Serif",
  bodySizePt: 10,
  headingScale: 1.4,
  italicStyle: "italic",
  colors: {
    text: "#17201c",
    heading: "#17201c",
    primary: "#a33b20",
    accent: "#276f62",
    muted: "#767b76",
  },
  page: {
    size: "A4",
    marginTopMm: 20,
    marginRightMm: 18,
    marginBottomMm: 20,
    marginLeftMm: 18,
  },
  header: {
    enabled: false,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: false,
  },
  footer: {
    enabled: true,
    leftText: "Client",
    centerText: "",
    rightText: "",
    showPageNumber: true,
  },
} as const;

describe("document content foundation", () => {
  it("validates exact input and hashes both format and body", () => {
    const body = "  # Exact\n";
    expect(validateDocumentInput("markdown", body)).toBe(body);
    expect(inputHash("markdown", body)).toMatch(/^[a-f0-9]{64}$/);
    expect(inputHash("markdown", body)).not.toBe(inputHash("html", body));
    expect(sourceHash("source")).toBe(sourceHash("source"));
  });

  it("renders both formats deterministically as complete HTML", () => {
    const markdown = renderDocumentHtml("# Heading\n\nText", "markdown", style);
    const html = renderDocumentHtml(
      "<h1>Heading</h1><p>Text</p>",
      "html",
      style,
    );
    expect(markdown).toContain("<!doctype html>");
    expect(markdown).toContain("Content-Security-Policy");
    expect(markdown).toContain("<h1>Heading</h1>");
    expect(html).toContain("<p>Text</p>");
    expect(markdown).toBe(
      renderDocumentHtml("# Heading\n\nText", "markdown", style),
    );
  });

  it("strips active content, embeds, images, event handlers, and unsafe URLs", () => {
    const output = renderDocumentHtml(
      '<p onclick="x()">Safe</p><script>alert(1)</script><style>body{}</style><iframe src="https://bad.test">bad</iframe><object>bad</object><embed><img src="https://bad.test/x"><a href="javascript:alert(1)">bad</a><a href="/local">local</a><a href="//host.test">protocol</a><a href="data:x">data</a><a href="https://safe.test" onclick="x()">link</a>',
      "html",
      style,
    );
    expect(output).toContain("<p>Safe</p>");
    expect(output).toContain('href="https://safe.test"');
    expect(output).toContain('rel="noopener noreferrer"');
    expect(output).not.toMatch(
      /script|iframe|object|embed|img|onclick|javascript:|data:|\/\/host\.test|href="\/local"/i,
    );
  });

  it("sanitizes raw HTML emitted from Markdown and rejects empty sanitized results", () => {
    const output = renderDocumentHtml(
      "# Safe\n\n<script>alert(1)</script><img src=x>",
      "markdown",
      style,
    );
    expect(output).toContain("<h1>Safe</h1>");
    expect(output).not.toMatch(/script|img/i);
    expect(() =>
      renderDocumentHtml(
        "<script>alert(1)</script><style>x</style>",
        "html",
        style,
      ),
    ).toThrow(DocumentInputError);
    expect(() =>
      renderDocumentHtml("<iframe>bad</iframe>", "html", style),
    ).toThrow(DocumentInputError);
  });

  it("rejects malformed hazards and byte-limit violations", () => {
    expect(() => validateDocumentInput("markdown", "")).toThrow(
      DocumentInputError,
    );
    expect(() => validateDocumentInput("markdown", "a\u0000")).toThrow(
      DocumentInputError,
    );
    expect(() => validateDocumentInput("html", "\ufffd")).toThrow(
      DocumentInputError,
    );
    expect(() =>
      validateDocumentInput(
        "markdown",
        "é".repeat(DOCUMENT_BODY_MAX_BYTES / 2 + 1),
      ),
    ).toThrow(DocumentInputError);
  });

  it("uses the configured emphasis style", () => {
    const italic = renderDocumentHtml("*Text*", "markdown", style);
    const oblique = renderDocumentHtml("*Text*", "markdown", {
      ...style,
      italicStyle: "oblique",
    });
    expect(italic).toContain("em { font-style: italic; }");
    expect(oblique).toContain("em { font-style: oblique; }");
  });

  it("renders enabled headers and footers in paged-media margin boxes", () => {
    const output = renderDocumentHtml("Text", "markdown", {
      ...style,
      header: {
        enabled: true,
        leftText: "Header left",
        centerText: "Header center",
        rightText: "Header right",
        showPageNumber: true,
      },
    });
    expect(output).toContain(
      '@top-left { color: #767b76; content: "Header left"',
    );
    expect(output).toContain(
      '@top-right { color: #767b76; content: "Header right" " " counter(page);',
    );
    expect(output).toContain(
      '@bottom-left { color: #767b76; content: "Client"',
    );
    expect(output).toContain(
      '@bottom-right { color: #767b76; content: "" " " counter(page);',
    );
    expect(output).not.toContain('<header class="running">');
    expect(output).not.toContain('<footer class="running">');
  });

  it("omits margin boxes for disabled headers and footers", () => {
    const output = renderDocumentHtml("Text", "markdown", {
      ...style,
      footer: { ...style.footer, enabled: false },
    });
    expect(output).not.toContain("@top-left");
    expect(output).not.toContain("@bottom-left");
  });

  it("CSS-string-escapes paged text without allowing a style breakout", () => {
    const output = renderDocumentHtml("Text", "markdown", {
      ...style,
      header: {
        enabled: true,
        leftText: 'quote " slash \\ newline\n</style>{}',
        centerText: "",
        rightText: "",
        showPageNumber: false,
      },
      footer: { ...style.footer, enabled: false },
    });
    expect(output).toContain(
      'content: "quote \\22  slash \\5c  newline\\a \\3c /style\\3e \\7b \\7d ";',
    );
    expect(output).not.toContain("</style>{}");
    expect(output.match(/<\/style>/g)).toHaveLength(1);
  });
});
