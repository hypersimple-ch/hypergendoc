import { describe, expect, it } from "vitest";
import {
  LatexSubsetError,
  normalizeLatexBody,
  wrapLatexDocument,
} from "./index.js";

const style = {
  logoObjectId: null,
  bodyFont: "Inter",
  headingFont: "Inter",
  bodySizePt: 11,
  headingScale: 1.4,
  italicStyle: "italic",
  colors: {
    text: "#111111",
    heading: "#222222",
    primary: "#123456",
    accent: "#654321",
    muted: "#777777",
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
    showPageNumber: false,
  },
} as const;

describe("curated LaTeX subset", () => {
  it("has deterministic golden normalized source", () => {
    const body =
      "\\section{A \\& B}\n\nHello \\textbf{world}.\n\\begin{itemize}\\item One\\item Two\\end{itemize}";
    expect(normalizeLatexBody(body)).toBe(
      "\\section{A \\& B}\n\nHello \\textbf{world}.\n\n\\begin{itemize}\n\\item One\n\\item Two\n\\end{itemize}\n",
    );
    const source = wrapLatexDocument(body, style);
    expect(source).toContain("\\documentclass[11pt]{article}");
    expect(source).toContain("\\usepackage[a4paper,");
    expect(source).toContain("\\ifnum\\HGPageCount>100");
    expect(
      wrapLatexDocument(body, {
        ...style,
        page: { ...style.page, size: "LETTER" },
      }),
    ).toContain("\\usepackage[letterpaper,");
  });

  it("applies server-owned fonts, layout, emphasis, chrome, and logo hook", () => {
    const source = wrapLatexDocument("\\section{Heading}\n\n\\emph{Body}", {
      ...style,
      logoObjectId: "11111111-1111-4111-8111-111111111111",
      bodyFont: "IBM Plex Sans",
      headingFont: "Noto Serif",
      headingScale: 1.5,
      italicStyle: "oblique",
      header: {
        enabled: true,
        leftText: "Left",
        centerText: "Center",
        rightText: "Right",
        showPageNumber: true,
      },
      footer: {
        enabled: true,
        leftText: "Foot",
        centerText: "",
        rightText: "",
        showPageNumber: true,
      },
    });
    expect(source).toContain("\\setmainfont{DejaVu Sans Condensed}");
    expect(source).toContain("\\newfontfamily\\HGHeadingFont{DejaVu Serif}");
    expect(source).toContain("\\fontshape{sl}\\selectfont");
    expect(source).toContain(
      "\\titleformat{\\section}{\\HGHeadingFont\\color{HGHeading}",
    );
    expect(source).toContain("\\fontsize{16.50pt}{19.80pt}\\selectfont");
    expect(source).toContain("\\rhead{Right\\quad\\thepage}");
    expect(source).toContain("\\rfoot{\\quad\\thepage}");
    expect(source).toContain(
      "\\newcommand{\\HGLogoAsset}{\\fbox{\\scriptsize Logo}}",
    );
    expect(source).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it.each([
    "\\documentclass{article}",
    "\\usepackage{x}",
    "\\input{/etc/passwd}",
    "\\write18{x}",
    "\\openout1=/tmp/x",
    "\\special{shell:touch /tmp/x}",
    "\\csname input\\endcsname",
    "\\catcode`@=11",
    "\\begin{unknown}x\\end{unknown}",
    "\\input{/tmp/hypergendoc-render-other/document.tex}",
    "\\input{/run/hypergendoc/renderer.sock}",
    "text % hidden",
    "\\section{unterminated",
    "\\textbf{\\textbf{\\textbf{\\textbf{\\textbf{\\textbf{\\textbf{\\textbf{\\textbf{\\textbf{\\textbf{\\textbf{\\textbf{x}}}}}}}}}}}}}",
    "\\href{file:///etc/passwd}{x}",
    "\\href{http://example.test}{x}",
    "raw_underscore",
    "\\begin{tabular}{ll}a & b & c\\\\\\end{tabular}",
    "\\input{../sibling.tex}",
    "x\uFFFD",
    "\\expandafter\\input\\csname x\\endcsname",
    "x\u0000y",
  ])("rejects adversarial input", (body) => {
    expect(() => normalizeLatexBody(body)).toThrow(LatexSubsetError);
  });
});
