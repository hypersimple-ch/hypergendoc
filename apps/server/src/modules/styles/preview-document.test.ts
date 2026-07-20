import { describe, expect, it } from "vitest";
import {
  DOCUMENT_BODY_MAX_BYTES,
  renderDocumentHtml,
  validateDocumentInput,
} from "@hypergendoc/document";
import { STYLE_PREVIEW_DOCUMENT } from "./preview-document.js";

const style = {
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
    enabled: true,
    leftText: "Northstar",
    centerText: "Growth report",
    rightText: "",
    showPageNumber: true,
  },
  footer: {
    enabled: true,
    leftText: "Confidential",
    centerText: "",
    rightText: "",
    showPageNumber: true,
  },
} as const;

describe("style preview document", () => {
  it("remains bounded and exercises every supported visual role", () => {
    expect(Buffer.byteLength(STYLE_PREVIEW_DOCUMENT.body, "utf8")).toBeLessThan(
      DOCUMENT_BODY_MAX_BYTES,
    );
    expect(() =>
      validateDocumentInput(
        STYLE_PREVIEW_DOCUMENT.format,
        STYLE_PREVIEW_DOCUMENT.body,
      ),
    ).not.toThrow();

    const html = renderDocumentHtml(
      STYLE_PREVIEW_DOCUMENT.body,
      STYLE_PREVIEW_DOCUMENT.format,
      style,
    );

    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(html).toContain(`<h${level}>`);
    }
    expect(html.match(/<p>/g)?.length).toBeGreaterThanOrEqual(14);
    expect(html).toContain("<strong>");
    expect(html).toContain("<em>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<table>");
    expect(html).toContain("<caption>");
    expect(html).toContain("<code>");
    expect(html).toContain("<hr />");
    expect(html).toContain('href="https://example.com/operating-model"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
