import { describe, expect, it } from "vitest";
import {
  CreateDocumentInputSchema,
  CreateMcpCredentialInputSchema,
  ErrorEnvelopeSchema,
  ListStylesToolInputSchema,
  RegisterInputSchema,
  StyleDefinitionSchema,
} from "./index.js";

const id = "00000000-0000-4000-8000-000000000001";
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
  });

  it("accepts the reference document request", () => {
    expect(
      CreateDocumentInputSchema.parse({
        companyId: id,
        styleId: id,
        title: "Website redesign proposal",
        body: "\\section{Overview}\nA focused proposal.",
        metadata: { reference: "P-001" },
      }),
    ).toMatchObject({ companyId: id, styleId: id });
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
        body: "é".repeat(131_073),
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
