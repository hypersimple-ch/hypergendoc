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

  it("accepts a valid definition locale and rejects invalid BCP-47 tags", () => {
    expect(
      TemplateDefinitionSchema.safeParse({ ...valid, locale: "fr-FR" }).success,
    ).toBe(true);
    expect(
      TemplateDefinitionSchema.safeParse({ ...valid, locale: "de-CH-1901" })
        .success,
    ).toBe(true);
    expect(TemplateDefinitionSchema.safeParse(valid).success).toBe(true);
    expect(
      TemplateDefinitionSchema.safeParse({ ...valid, locale: "not a locale" })
        .success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse({ ...valid, locale: "en_US" }).success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse({ ...valid, locale: "en--US" })
        .success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse({ ...valid, locale: "e" }).success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse({ ...valid, locale: "12" }).success,
    ).toBe(false);
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

  it("accepts table footer rows and rejects misaligned or unknown ones", () => {
    const table = {
      type: "table",
      source: "rows",
      tableColumns: [{ header: "Amount", path: "amount", format: "money" }],
      zebraRows: true,
    } as const;
    const documentFor = (footerRow: readonly unknown[]) => ({
      ...valid,
      document: [
        {
          type: "page",
          master: "cover",
          children: [{ ...table, footerRow }],
        },
      ],
    });
    const parses = (footerRow: readonly unknown[]) =>
      TemplateDefinitionSchema.safeParse(documentFor(footerRow)).success;
    expect(parses([{ path: "total" }])).toBe(true);
    expect(parses([{}])).toBe(true);
    expect(parses([{ path: "total" }, {}])).toBe(false);
    expect(parses([{ path: "total" }, {}, {}])).toBe(false);
    expect(parses([{ path: "unknown" }])).toBe(false);
  });

  it("allows hyphenated repeater aliases per the identifier rule", () => {
    const aliased = {
      ...valid,
      document: [
        {
          type: "page",
          master: "cover",
          children: [
            {
              type: "repeat",
              source: "rows",
              as: "line-item",
              children: [
                {
                  type: "paragraph",
                  content: [{ type: "binding", path: "line-item.amount" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(TemplateDefinitionSchema.safeParse(aliased).success).toBe(true);
    expect(
      TemplateDefinitionSchema.safeParse({
        ...aliased,
        document: [
          {
            type: "page",
            master: "cover",
            children: [{ ...aliased.document[0]!.children[0], as: "-bad" }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts image frame controls only on image nodes within bounds", () => {
    const framedImage = {
      type: "image",
      source: "00000000-0000-4000-8000-0000000000aa",
      widthMm: 120,
      cornerRadiusMm: 6,
      frame: { color: "accent", weight: "thick" },
    } as const;
    expect(
      TemplateDefinitionSchema.safeParse({ ...valid, document: [framedImage] })
        .success,
    ).toBe(true);
    // Frame properties are invalid on non-image nodes.
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        document: [
          {
            type: "paragraph",
            content: [{ type: "text", value: "x" }],
            widthMm: 100,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        document: [
          {
            type: "paragraph",
            content: [{ type: "text", value: "x" }],
            frame: { color: "primary", weight: "thin" },
          },
        ],
      }).success,
    ).toBe(false);
    // Bounds: widthMm <= 190, cornerRadiusMm <= 20, token colors only.
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        document: [
          {
            type: "image",
            source: "00000000-0000-4000-8000-0000000000aa",
            widthMm: 191,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        document: [
          {
            type: "image",
            source: "00000000-0000-4000-8000-0000000000aa",
            cornerRadiusMm: 21,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        document: [
          {
            type: "image",
            source: "00000000-0000-4000-8000-0000000000aa",
            frame: { color: "#31a7c8", weight: "thin" },
          },
        ] as never,
      }).success,
    ).toBe(false);
  });

  it("accepts portrait/landscape page-master orientation and rejects other values", () => {
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        pageMasters: { cover: { orientation: "landscape" }, standard: {} },
      }).success,
    ).toBe(true);
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        pageMasters: { cover: { orientation: "seascape" }, standard: {} },
      }).success,
    ).toBe(false);
  });

  it("validates page-master watermarks strictly", () => {
    const masterFor = (watermark: unknown) => ({
      ...valid,
      pageMasters: {
        cover: { background: "heading", watermark },
        standard: {},
      },
    });
    expect(
      TemplateDefinitionSchema.safeParse(
        masterFor({ text: "Confidential", tone: "danger", opacity: "subtle" }),
      ).success,
    ).toBe(true);
    expect(
      TemplateDefinitionSchema.safeParse(masterFor({ text: "Draft" })).success,
    ).toBe(true);
    expect(TemplateDefinitionSchema.safeParse(masterFor("Draft")).success).toBe(
      false,
    );
    expect(
      TemplateDefinitionSchema.safeParse(masterFor({ text: "" })).success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse(masterFor({ text: "x".repeat(65) }))
        .success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse(
        masterFor({ text: "Draft", tone: "critical" }),
      ).success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse(
        masterFor({ text: "Draft", opacity: "invisible" }),
      ).success,
    ).toBe(false);
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

  it("accepts richer expressions with well-typed operands", () => {
    const computed = {
      total: { op: "sum", path: "rows", valuePath: "amount" },
      smallest: { op: "min", path: "amounts" },
      largest: {
        op: "max",
        operands: [
          { op: "path", path: "total" },
          { op: "value", value: 10 },
        ],
      },
      rounded: {
        op: "round",
        value: { op: "divide", left: { op: "path", path: "total" }, right: { op: "value", value: 3 } },
        decimals: 2,
      },
      magnitude: { op: "abs", value: { op: "subtract", left: { op: "path", path: "total" }, right: { op: "value", value: 5 } } },
      ceiling: { op: "ceil", value: { op: "count", path: "rows" } },
      floored: { op: "floor", value: { op: "value", value: 4.7 } },
      label: {
        op: "concat",
        parts: [
          { op: "value", value: "Total: " },
          { op: "path", path: "title" },
          { op: "dateAdd", path: "when", days: { op: "value", value: 3 } },
        ],
      },
      tier: {
        op: "if",
        condition: { path: "total", operator: "gt", value: 100 },
        then: { op: "value", value: "high" },
        otherwise: { op: "value", value: "low" },
      },
    } as const;
    expect(
      TemplateDefinitionSchema.safeParse({
        ...valid,
        fields: {
          ...valid.fields,
          when: { type: "date", label: "When" },
          amounts: {
            type: "list",
            label: "Amounts",
            item: { type: "money", label: "Amount", currency: "CHF" },
          },
        },
        computed,
      }).success,
    ).toBe(true);
  });

  it("rejects mis-typed richer expressions with clear boundaries", () => {
    const base = {
      ...valid,
      fields: { ...valid.fields, when: { type: "date", label: "When" } },
    };
    // min over a text list
    expect(
      TemplateDefinitionSchema.safeParse({
        ...base,
        fields: {
          ...base.fields,
          names: {
            type: "list",
            label: "Names",
            item: { type: "text", label: "Name" },
          },
        },
        computed: { smallest: { op: "min", path: "names" } },
      }).success,
    ).toBe(false);
    // max operand that is not numeric
    expect(
      TemplateDefinitionSchema.safeParse({
        ...base,
        computed: {
          largest: {
            op: "max",
            operands: [{ op: "path", path: "title" }, { op: "value", value: 2 }],
          },
        },
      }).success,
    ).toBe(false);
    // round on a non-numeric value
    expect(
      TemplateDefinitionSchema.safeParse({
        ...base,
        computed: { rounded: { op: "round", value: { op: "path", path: "title" } } },
      }).success,
    ).toBe(false);
    // concat of a boolean operand
    expect(
      TemplateDefinitionSchema.safeParse({
        ...base,
        fields: {
          ...base.fields,
          flag: { type: "boolean", label: "Flag" },
        },
        computed: {
          label: {
            op: "concat",
            parts: [
              { op: "value", value: "x" },
              { op: "path", path: "flag" },
            ],
          },
        },
      }).success,
    ).toBe(false);
    // if branches disagreeing on type
    expect(
      TemplateDefinitionSchema.safeParse({
        ...base,
        computed: {
          tier: {
            op: "if",
            condition: { path: "title", operator: "truthy" },
            then: { op: "value", value: "text" },
            otherwise: { op: "value", value: 3 },
          },
        },
      }).success,
    ).toBe(false);
    // single-operand concat is rejected by cardinality
    expect(
      TemplateDefinitionSchema.safeParse({
        ...base,
        computed: {
          label: { op: "concat", parts: [{ op: "path", path: "title" }] },
        },
      }).success,
    ).toBe(false);
    // out-of-range decimals
    expect(
      TemplateDefinitionSchema.safeParse({
        ...base,
        computed: {
          rounded: { op: "round", value: { op: "value", value: 1 }, decimals: 7 },
        },
      }).success,
    ).toBe(false);
    // unknown path inside an if condition
    expect(
      TemplateDefinitionSchema.safeParse({
        ...base,
        computed: {
          tier: {
            op: "if",
            condition: { path: "missing", operator: "truthy" },
            then: { op: "value", value: "a" },
            otherwise: { op: "value", value: "b" },
          },
        },
      }).success,
    ).toBe(false);
  });

  it("detects cycles that flow through richer expression forms", () => {
    const base = { ...valid, fields: { ...valid.fields, when: { type: "date", label: "When" } } };
    expect(
      TemplateDefinitionSchema.safeParse({
        ...base,
        computed: {
          a: {
            op: "max",
            operands: [{ op: "path", path: "b" }, { op: "value", value: 1 }],
          },
          b: { op: "abs", value: { op: "path", path: "a" } },
        },
      }).success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse({
        ...base,
        computed: {
          a: {
            op: "concat",
            parts: [{ op: "value", value: "x" }, { op: "path", path: "b" }],
          },
          b: { op: "path", path: "a" },
        },
      }).success,
    ).toBe(false);
    expect(
      TemplateDefinitionSchema.safeParse({
        ...base,
        computed: {
          a: {
            op: "round",
            value: {
              op: "add",
              left: { op: "path", path: "total" },
              right: { op: "value", value: 0 },
            },
          },
          total: { op: "sum", path: "rows", valuePath: "amount" },
        },
      }).success,
    ).toBe(true);
  });

  it("accepts qr nodes with a literal value or a text source path", () => {
    const documentFor = (qr: readonly unknown[]) => ({
      ...valid,
      document: [{ type: "page", master: "cover", children: qr }],
    });
    expect(
      TemplateDefinitionSchema.safeParse(
        documentFor([{ type: "qr", value: "https://example.com" }]),
      ).success,
    ).toBe(true);
    expect(
      TemplateDefinitionSchema.safeParse(
        documentFor([
          {
            type: "qr",
            source: "title",
            sizeMm: 40,
            errorCorrection: "high",
            caption: [{ type: "text", value: "Scan me" }],
          },
        ]),
      ).success,
    ).toBe(true);
    // Defaults apply without error.
    expect(
      TemplateDefinitionSchema.safeParse(documentFor([{ type: "qr", source: "title" }]))
        .success,
    ).toBe(true);
  });

  it("rejects invalid qr nodes across the full failure matrix", () => {
    const documentFor = (qr: readonly unknown[]) => ({
      ...valid,
      document: [{ type: "page", master: "cover", children: qr }],
    });
    const parses = (children: readonly unknown[]) =>
      TemplateDefinitionSchema.safeParse(documentFor(children)).success;
    // Bad size bounds
    expect(parses([{ type: "qr", value: "x", sizeMm: 9 }])).toBe(false);
    expect(parses([{ type: "qr", value: "x", sizeMm: 81 }])).toBe(false);
    expect(parses([{ type: "qr", value: "x", sizeMm: 80 }])).toBe(true);
    // Both value and source, or neither
    expect(
      parses([{ type: "qr", value: "x", source: "title" }]),
    ).toBe(false);
    expect(parses([{ type: "qr" }])).toBe(false);
    // Unknown or non-text source paths
    expect(parses([{ type: "qr", source: "unknown" }])).toBe(false);
    expect(
      parses([
        { type: "qr", source: "rows" },
      ]),
    ).toBe(false);
    expect(
      parses([
        { type: "qr", source: "total" },
      ]),
    ).toBe(false);
    // Unknown errorCorrection values
    expect(
      parses([{ type: "qr", value: "x", errorCorrection: "extreme" }]),
    ).toBe(false);
    // Empty and oversized values
    expect(parses([{ type: "qr", value: "" }])).toBe(false);
    expect(parses([{ type: "qr", value: "x".repeat(2953) }])).toBe(true);
    expect(parses([{ type: "qr", value: "x".repeat(2954) }])).toBe(false);
    expect(
      parses([{ type: "qr", value: "é".repeat(1476) }]),
    ).toBe(true);
    expect(
      parses([{ type: "qr", value: "é".repeat(1477) }]),
    ).toBe(false);
  });

  it("caps the total number of qr nodes per template at 20", () => {
    const page = (count: number) => ({
      type: "page",
      master: "cover",
      children: Array.from({ length: count }, () => ({
        type: "qr",
        value: "https://example.com",
      })),
    });
    const documentFor = (pages: readonly unknown[]) => ({
      ...valid,
      document: pages,
    });
    expect(
      TemplateDefinitionSchema.safeParse(
        documentFor([page(10), page(10)]),
      ).success,
    ).toBe(true);
    expect(
      TemplateDefinitionSchema.safeParse(
        documentFor([page(11), page(10)]),
      ).success,
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
