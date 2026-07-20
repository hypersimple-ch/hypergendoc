import { describe, expect, it } from "vitest";
import {
  CommitShaSchema,
  CreateDocumentInputSchema,
  CreateDocumentToolInputSchema,
  CreateMcpCredentialInputSchema,
  ErrorEnvelopeSchema,
  ListStylesToolInputSchema,
  McpToolNameSchema,
  RegisterInputSchema,
  RevertDocumentToolInputSchema,
  StyleDefinitionSchema,
  UpdateDocumentToolInputSchema,
} from "./index.js";

const id = "00000000-0000-4000-8000-000000000001";
const textStyles = {
  h1: {
    fontFamily: "Noto Serif",
    fontSizePt: 28,
    fontWeight: 700,
    lineHeight: 1.15,
    color: "#17201c",
  },
  h2: {
    fontFamily: "Noto Serif",
    fontSizePt: 22,
    fontWeight: 700,
    lineHeight: 1.2,
    color: "#17201c",
  },
  h3: {
    fontFamily: "Noto Serif",
    fontSizePt: 18,
    fontWeight: 600,
    lineHeight: 1.25,
    color: "#17201c",
  },
  h4: {
    fontFamily: "Noto Serif",
    fontSizePt: 15,
    fontWeight: 600,
    lineHeight: 1.3,
    color: "#17201c",
  },
  h5: {
    fontFamily: "Noto Serif",
    fontSizePt: 12,
    fontWeight: 600,
    lineHeight: 1.35,
    color: "#17201c",
  },
  h6: {
    fontFamily: "Noto Serif",
    fontSizePt: 10,
    fontWeight: 600,
    lineHeight: 1.4,
    color: "#17201c",
  },
  caption: {
    fontFamily: "Inter",
    fontSizePt: 8,
    fontWeight: 400,
    lineHeight: 1.4,
    color: "#767b76",
  },
} as const;

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
};

describe("shared contracts", () => {
  it("accepts documented registration and style values", () => {
    expect(
      RegisterInputSchema.parse({
        name: "Ada",
        email: "ADA@example.com",
        password: "correct horse battery",
      }),
    ).toMatchObject({ email: "ada@example.com" });
    expect(StyleDefinitionSchema.parse(style)).toEqual(style);
    expect(StyleDefinitionSchema.parse({ ...style, textStyles })).toMatchObject(
      { textStyles },
    );
  });

  it("validates explicit text styles while retaining legacy definitions", () => {
    expect(StyleDefinitionSchema.parse(style)).toEqual(style);
    expect(() =>
      StyleDefinitionSchema.parse({
        ...style,
        textStyles: {
          ...textStyles,
          h1: { ...textStyles.h1, fontSizePt: 73 },
        },
      }),
    ).toThrow();
    expect(() =>
      StyleDefinitionSchema.parse({
        ...style,
        textStyles: {
          ...textStyles,
          caption: { ...textStyles.caption, tracking: 0.1 },
        },
      }),
    ).toThrow();
  });

  it("accepts the reference document request", () => {
    expect(
      CreateDocumentInputSchema.parse({
        companyId: id,
        styleId: id,
        title: "Website redesign proposal",
        format: "markdown",
        body: "# Overview\nA focused proposal.",
        metadata: { reference: "P-001" },
      }),
    ).toMatchObject({ companyId: id, styleId: id });
  });

  it("makes document format and style explicit in MCP write schemas", () => {
    expect(
      CreateDocumentToolInputSchema.parse({
        companyId: id,
        styleId: id,
        title: "MCP document",
        format: "markdown",
        body: "# Exact",
      }),
    ).toMatchObject({ format: "markdown", body: "# Exact" });
    expect(
      UpdateDocumentToolInputSchema.parse({
        documentId: id,
        styleVersionId: id,
        format: "html",
        body: "<p>Exact</p>",
      }),
    ).toMatchObject({ format: "html", body: "<p>Exact</p>" });
    expect(() =>
      UpdateDocumentToolInputSchema.parse({
        documentId: id,
        styleVersionId: "not-a-style",
        format: "html",
        body: "<p>Exact</p>",
      }),
    ).toThrow();
    expect(() =>
      UpdateDocumentToolInputSchema.parse({
        documentId: id,
        styleVersionId: id,
        body: "# Missing format",
      }),
    ).toThrow();
  });

  it("accepts only lowercase SHA-1 or SHA-256 document commits", () => {
    const sha1 = "a".repeat(40);
    const sha256 = "b".repeat(64);
    expect(CommitShaSchema.parse(sha1)).toBe(sha1);
    expect(CommitShaSchema.parse(sha256)).toBe(sha256);
    expect(
      RevertDocumentToolInputSchema.parse({ documentId: id, commitSha: sha1 }),
    ).toMatchObject({ commitSha: sha1 });
    for (const invalidSha of ["A".repeat(40), "a".repeat(39), "g".repeat(64)]) {
      expect(() => CommitShaSchema.parse(invalidSha)).toThrow();
    }
  });

  it("rejects removed numeric-version MCP tools", () => {
    expect(() => McpToolNameSchema.parse("get_document_version")).toThrow();
    expect(() => McpToolNameSchema.parse("create_document_version")).toThrow();
    expect(McpToolNameSchema.parse("read_document_commit")).toBe(
      "read_document_commit",
    );
  });

  it("rejects unknown fields and malformed identifiers", () => {
    expect(() =>
      ListStylesToolInputSchema.parse({ companyId: "other", admin: true }),
    ).toThrow();
    expect(() =>
      StyleDefinitionSchema.parse({
        ...style,
        preamble: "\\input{/etc/passwd}",
      }),
    ).toThrow();
  });

  it("rejects duplicate or empty MCP scopes", () => {
    expect(() =>
      CreateMcpCredentialInputSchema.parse({
        name: "Agent",
        companyIds: [id, id],
        actions: ["documents:read"],
      }),
    ).toThrow();
    expect(() =>
      CreateMcpCredentialInputSchema.parse({
        name: "Agent",
        companyIds: [id],
        actions: [],
      }),
    ).toThrow();
  });

  it("rejects UTF-8 document bodies above the byte limit", () => {
    expect(() =>
      CreateDocumentInputSchema.parse({
        companyId: id,
        styleId: id,
        title: "Too large",
        format: "html",
        body: "é".repeat(131_073),
      }),
    ).toThrow();
  });

  it("requires a document format and preserves exact valid bodies", () => {
    const body = "  <p>Exact body</p>\n";
    expect(
      CreateDocumentInputSchema.parse({
        companyId: id,
        styleId: id,
        title: "Exact input",
        format: "html",
        body,
      }).body,
    ).toBe(body);
    expect(() =>
      CreateDocumentInputSchema.parse({
        companyId: id,
        styleId: id,
        title: "Missing format",
        body,
      }),
    ).toThrow();
    expect(() =>
      CreateDocumentInputSchema.parse({
        companyId: id,
        styleId: id,
        title: "Unsafe body",
        format: "markdown",
        body: "text\u0000",
      }),
    ).toThrow();
  });

  it("keeps the public error envelope safe and strict", () => {
    expect(
      ErrorEnvelopeSchema.parse({
        error: {
          code: "not_found",
          message: "Resource not found.",
          requestId: "request-1234",
        },
      }),
    ).toBeTruthy();
    expect(() =>
      ErrorEnvelopeSchema.parse({
        error: {
          code: "internal_error",
          message: "failed",
          requestId: "request-1234",
          stack: "/srv/secret.ts",
        },
      }),
    ).toThrow();
  });
});
