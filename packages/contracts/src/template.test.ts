import { describe, expect, it } from "vitest";
import {
  CreateMcpCredentialInputSchema,
  TemplateDefinitionSchema,
  TemplateDataSchema,
} from "./index.js";

const styleVersionId = "00000000-0000-4000-8000-000000000001";
const valid = {
  schemaVersion: 1,
  styleVersionId,
  fields: {
    title: { type: "text", label: "Title", required: true },
    rows: {
      type: "list",
      label: "Rows",
      item: {
        type: "object",
        label: "Row",
        fields: { amount: { type: "money", label: "Amount", currency: "CHF" } },
      },
    },
  },
  computed: { total: { op: "sum", path: "rows", valuePath: "amount" } },
  pageMasters: { cover: { background: "heading" }, standard: {} },
  document: [
    {
      type: "page",
      master: "cover",
      children: [
        {
          type: "heading",
          level: 1,
          content: [{ type: "binding", path: "title" }],
        },
      ],
    },
  ],
} as const;

describe("template contracts", () => {
  it("accepts business-specific data over generic fields and layout nodes", () => {
    expect(TemplateDefinitionSchema.parse(valid)).toMatchObject({
      schemaVersion: 1,
    });
    expect(
      TemplateDataSchema.parse({
        title: "Specific document",
        rows: [{ amount: 20 }],
      }),
    ).toBeDefined();
  });

  it("rejects raw HTML/CSS/script nodes and unknown definition properties", () => {
    expect(() =>
      TemplateDefinitionSchema.parse({ ...valid, script: "alert(1)" }),
    ).toThrow();
    expect(() =>
      TemplateDefinitionSchema.parse({
        ...valid,
        document: [{ type: "rawHtml", value: "<script>" }],
      }),
    ).toThrow();
  });

  it("rejects CSS-shaped page-master and component identifiers", () => {
    expect(() =>
      TemplateDefinitionSchema.parse({
        ...valid,
        pageMasters: { "cover}body{display:none": {} },
      }),
    ).toThrow();
    expect(() =>
      TemplateDefinitionSchema.parse({
        ...valid,
        components: { "section\n@page": [] },
      }),
    ).toThrow();
    expect(() =>
      TemplateDefinitionSchema.parse({
        ...valid,
        document: [{ type: "page", master: "cover}body{display:none" }],
      }),
    ).toThrow();
  });

  it("rejects invalid defaults, references, paths, and recursive graphs", () => {
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        fields: {
          ...valid.fields,
          enabled: { type: "boolean", label: "Enabled", default: "yes" },
        },
      }).success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        document: [
          {
            type: "page",
            master: "missing",
            children: [
              {
                type: "paragraph",
                content: [{ type: "binding", path: "unknown" }],
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        document: [
          {
            type: "page",
            master: "cover",
            children: [
              {
                type: "paragraph",
                content: [{ type: "binding", path: "title.unknown" }],
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        components: {
          first: [{ type: "component", component: "second" }],
          second: [{ type: "component", component: "first" }],
        },
      }).success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        computed: {
          first: { op: "path", path: "second" },
          second: { op: "path", path: "first" },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects deeply recursive definitions before recursive schema parsing", () => {
    let field: unknown = { type: "text", label: "Leaf" };
    for (let index = 0; index < 100; index += 1)
      field = {
        type: "object",
        label: `Level ${index}`,
        fields: { child: field },
      };
    expect(() =>
      TemplateDefinitionSchema.safeParse({
        ...valid,
        fields: { nested: field },
      }),
    ).not.toThrow();
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        fields: { nested: field },
      }).success,
    ).toBe(false);
  });

  it("supports the independent templates read scope", () => {
    const result = CreateMcpCredentialInputSchema.parse({
      name: "Template consumer",
      companyIds: [styleVersionId],
      actions: [
        "companies:read",
        "styles:read",
        "templates:read",
        "documents:read",
        "documents:write",
      ],
    });
    expect(result.actions).toContain("templates:read");
  });
});
