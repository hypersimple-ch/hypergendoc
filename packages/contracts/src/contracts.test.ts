import { describe, expect, it } from "vitest";
import {
  CommitShaSchema,
  CompanyAssetsSchema,
  CreateDocumentInputSchema,
  CreateDocumentToolInputSchema,
  CreateMcpCredentialInputSchema,
  ErrorEnvelopeSchema,
  ListStylesToolInputSchema,
  McpToolNameSchema,
  RegisterInputSchema,
  RevertDocumentToolInputSchema,
  ResolvedStyleAssetsSchema,
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

  it("accepts asset-aware styles without changing legacy definitions", () => {
    const fontId = "00000000-0000-4000-8000-000000000002";
    const assetStyle = {
      ...style,
      assetVersion: 1,
      bodyFont: fontId,
      textStyles: {
        ...textStyles,
        caption: { ...textStyles.caption, fontFamily: fontId },
      },
    } as const;

    expect(StyleDefinitionSchema.parse(style)).toEqual(style);
    expect(StyleDefinitionSchema.parse(assetStyle)).toEqual(assetStyle);
    expect(() =>
      StyleDefinitionSchema.parse({ ...assetStyle, assetVersion: 2 }),
    ).toThrow();
    expect(() =>
      StyleDefinitionSchema.parse({ ...style, bodyFont: fontId }),
    ).toThrow();
  });

  it("validates company asset catalogs and resolved render payloads", () => {
    const fontId = "00000000-0000-4000-8000-000000000002";
    const logoId = "00000000-0000-4000-8000-000000000003";
    expect(
      CompanyAssetsSchema.parse({
        logos: [
          {
            id: logoId,
            displayName: "Primary logo.png",
            contentType: "image/png",
            byteSize: 128,
            contentUrl: `/api/companies/${id}/assets/logos/${logoId}/content`,
            createdAt: "2026-07-21T10:00:00.000Z",
          },
        ],
        fonts: [
          {
            id: "Inter",
            source: "built_in",
            familyName: "Inter",
            subfamilyName: null,
            displayName: "Inter",
            owned: false,
            contentUrl: null,
          },
          {
            id: fontId,
            source: "uploaded",
            familyName: "Acme Sans",
            subfamilyName: "Regular",
            displayName: "Acme Sans Regular",
            owned: true,
            contentUrl: `/api/companies/${id}/assets/fonts/${fontId}/content`,
          },
        ],
        colors: ["#aabbcc"],
      }),
    ).toBeTruthy();

    expect(
      ResolvedStyleAssetsSchema.parse({
        logo: {
          id: logoId,
          contentType: "image/png",
          byteSize: 3,
          sha256: "a".repeat(64),
          base64: "YWJj",
        },
        fonts: [
          {
            id: fontId,
            contentType: "font/woff2",
            byteSize: 3,
            sha256: "b".repeat(64),
            base64: "YWJj",
          },
        ],
      }),
    ).toBeTruthy();
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
