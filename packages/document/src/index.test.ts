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

const assetId = "11111111-1111-4111-8111-111111111111";
const secondAssetId = "22222222-2222-4222-8222-222222222222";
const thirdAssetId = "33333333-3333-4333-8333-333333333333";
const logoId = "44444444-4444-4444-8444-444444444444";
const asset = (id: string, contentType: string, value: string) => {
  const bytes = Buffer.from(value);
  return {
    id,
    contentType,
    byteSize: bytes.length,
    sha256: sourceHash(bytes.toString("binary")),
    base64: bytes.toString("base64"),
  };
};

const textStyles = {
  h1: {
    fontFamily: "Inter",
    fontSizePt: 24,
    fontWeight: 700,
    lineHeight: 1.1,
    color: "#101112",
  },
  h2: {
    fontFamily: "DM Sans",
    fontSizePt: 20,
    fontWeight: 600,
    lineHeight: 1.2,
    color: "#202122",
  },
  h3: {
    fontFamily: "Source Sans 3",
    fontSizePt: 18,
    fontWeight: 500,
    lineHeight: 1.3,
    color: "#303132",
  },
  h4: {
    fontFamily: "Noto Sans",
    fontSizePt: 16,
    fontWeight: 400,
    lineHeight: 1.4,
    color: "#404142",
  },
  h5: {
    fontFamily: "Fraunces",
    fontSizePt: 14,
    fontWeight: 700,
    lineHeight: 1.5,
    color: "#505152",
  },
  h6: {
    fontFamily: "IBM Plex Mono",
    fontSizePt: 12,
    fontWeight: 600,
    lineHeight: 1.6,
    color: "#606162",
  },
  caption: {
    fontFamily: "Noto Serif",
    fontSizePt: 9,
    fontWeight: 500,
    lineHeight: 1.7,
    color: "#707172",
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

  it("renders explicit deterministic text styles for every semantic role", () => {
    const styled = { ...style, textStyles };
    const output = renderDocumentHtml(
      "<table><caption>Quarterly results</caption><tr><td>Value</td></tr></table>",
      "html",
      styled,
    );

    expect(output).toContain(
      "h1 { color: #101112; font-family: Arial, sans-serif; font-size: 24pt; font-weight: 700; line-height: 1.1; }",
    );
    expect(output).toContain(
      "h2 { color: #202122; font-family: Arial, sans-serif; font-size: 20pt; font-weight: 600; line-height: 1.2; }",
    );
    expect(output).toContain(
      "h3 { color: #303132; font-family: Arial, sans-serif; font-size: 18pt; font-weight: 500; line-height: 1.3; }",
    );
    expect(output).toContain(
      "h4 { color: #404142; font-family: Arial, sans-serif; font-size: 16pt; font-weight: 400; line-height: 1.4; }",
    );
    expect(output).toContain(
      "h5 { color: #505152; font-family: Georgia, serif; font-size: 14pt; font-weight: 700; line-height: 1.5; }",
    );
    expect(output).toContain(
      "h6 { color: #606162; font-family: Courier New, monospace; font-size: 12pt; font-weight: 600; line-height: 1.6; }",
    );
    expect(output).toContain(
      "caption { color: #707172; font-family: Georgia, serif; font-size: 9pt; font-weight: 500; line-height: 1.7; }",
    );
    expect(output).toContain(
      "body { color: #17201c; font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.5; margin: 0; }",
    );
    expect(output).toBe(
      renderDocumentHtml(
        "<table><caption>Quarterly results</caption><tr><td>Value</td></tr></table>",
        "html",
        styled,
      ),
    );
  });

  it("renders an explicit body text style", () => {
    const output = renderDocumentHtml("Text", "markdown", {
      ...style,
      textStyles: {
        ...textStyles,
        body: {
          fontFamily: "Source Code Pro",
          fontSizePt: 11,
          fontWeight: 500,
          lineHeight: 1.25,
          color: "#808182",
        },
      },
    });

    expect(output).toContain(
      "body { color: #808182; font-family: Courier New, monospace; font-size: 11pt; font-weight: 500; line-height: 1.25; margin: 0; }",
    );
  });

  it("keeps captions while applying existing sanitizer safeguards", () => {
    const output = renderDocumentHtml(
      '<table><caption onclick="x()"><img src="x">Quarterly <strong>results</strong></caption><tr><td>Value</td></tr></table>',
      "html",
      style,
    );
    expect(output).toContain(
      "<caption>Quarterly <strong>results</strong></caption>",
    );
    expect(output).not.toMatch(/onclick|<img/i);
    expect(() =>
      renderDocumentHtml(
        "<table><caption><script>alert(1)</script></caption></table>",
        "html",
        style,
      ),
    ).toThrow(DocumentInputError);
  });

  it("preserves the exact legacy heading fallback without text styles", () => {
    const output = renderDocumentHtml("# Heading", "markdown", style);
    expect(output).toContain(
      "h1, h2, h3, h4, h5, h6 { color: #17201c; font-family: Georgia, serif; line-height: 1.2; }\nh1 { font-size: 14.00pt; } h2 { font-size: 11.90pt; }",
    );
    expect(output).not.toContain("caption {");
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

  it("renders verified v1 logo and custom fonts with deterministic data URLs", () => {
    const assets = {
      logo: asset(logoId, "image/png", "logo"),
      fonts: [
        asset(assetId, "font/ttf", "ttf"),
        asset(secondAssetId, "font/otf", "otf"),
        asset(thirdAssetId, "font/woff2", "woff2"),
      ],
    };
    const output = renderDocumentHtml(
      "# Heading",
      "markdown",
      {
        ...style,
        assetVersion: 1,
        logoObjectId: logoId,
        bodyFont: assetId,
        headingFont: secondAssetId,
        textStyles: {
          ...textStyles,
          h1: { ...textStyles.h1, fontFamily: thirdAssetId },
        },
      },
      assets,
    );
    expect(output).toContain(
      "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'",
    );
    expect(output).toContain(
      '<img class="document-logo" src="data:image/png;base64,bG9nbw==" alt="">',
    );
    expect(output).toContain(
      'font-family: "HypergendocFont_11111111111141118111111111111111"; src: url("data:font/ttf;base64,dHRm") format("truetype")',
    );
    expect(output).toContain('format("opentype")');
    expect(output).toContain('format("woff2")');
    expect(output).toContain(
      'font-family: "HypergendocFont_33333333333343338333333333333333", sans-serif',
    );
  });

  it("rejects invalid, missing, duplicate, and unreferenced v1 assets", () => {
    const v1 = { ...style, assetVersion: 1, bodyFont: assetId } as const;
    const valid = asset(assetId, "font/ttf", "font");
    const invalid = (assets: unknown) =>
      expect(() =>
        renderDocumentHtml("body", "markdown", v1, assets as never),
      ).toThrow(new DocumentInputError("invalid_assets"));
    invalid({ logo: null, fonts: [] });
    invalid({ logo: null, fonts: [valid, valid] });
    invalid({ logo: null, fonts: [asset(secondAssetId, "font/ttf", "font")] });
    invalid({ logo: null, fonts: [{ ...valid, contentType: "font/woff" }] });
    invalid({ logo: null, fonts: [{ ...valid, sha256: "0".repeat(64) }] });
    invalid({ logo: null, fonts: [{ ...valid, base64: "%%%%" }] });
    invalid({
      logo: null,
      fonts: [{ ...valid, byteSize: valid.byteSize + 1 }],
    });
  });

  it("keeps legacy source hashes exact while v1 asset bytes affect them", () => {
    const legacy = renderDocumentHtml("# Heading", "markdown", style);
    expect(sourceHash(legacy)).toBe(
      "30226b824c7c679927889d1ce5bffb3bbd60187c727b875ca729153e44c3f250",
    );
    expect(
      renderDocumentHtml("# Heading", "markdown", style, {
        logo: asset(logoId, "image/png", "ignored"),
        fonts: [],
      }),
    ).toBe(legacy);
    const v1 = { ...style, assetVersion: 1, bodyFont: assetId } as const;
    const first = renderDocumentHtml("# Heading", "markdown", v1, {
      logo: null,
      fonts: [asset(assetId, "font/ttf", "one")],
    });
    const second = renderDocumentHtml("# Heading", "markdown", v1, {
      logo: null,
      fonts: [asset(assetId, "font/ttf", "two")],
    });
    expect(sourceHash(first)).not.toBe(sourceHash(second));
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
