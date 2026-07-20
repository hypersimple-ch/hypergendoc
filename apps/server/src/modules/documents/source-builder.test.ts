import { describe, expect, it } from "vitest";
import { renderDocumentHtml } from "@hypergendoc/document";
import type { StyleDefinition } from "@hypergendoc/contracts";
import { createHtmlDocumentSourceBuilder } from "./source-builder.js";

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
} as StyleDefinition;

describe("HTML document source builder", () => {
  it.each(["markdown", "html"] as const)(
    "preserves exact %s input and resolves deterministic HTML",
    (format) => {
      const body = format === "markdown" ? "  # Exact\n" : "<p>Exact</p>\n";
      const result = createHtmlDocumentSourceBuilder().resolve(
        format,
        body,
        style,
      );
      expect(result.body).toBe(body);
      expect(result.source).toBe(renderDocumentHtml(body, format, style));
    },
  );
});
