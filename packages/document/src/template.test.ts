import { describe, expect, it } from "vitest";
import type {
  StyleDefinition,
  TemplateDefinition,
} from "@hypergendoc/contracts";
import {
  DocumentInputError,
  renderTemplateDocumentHtml,
  templateImageIds,
} from "./index.js";

const style: StyleDefinition = {
  assetVersion: 1,
  logoObjectId: null,
  bodyFont: "Inter",
  headingFont: "Playfair Display",
  bodySizePt: 10,
  headingScale: 1.8,
  italicStyle: "italic",
  colors: {
    text: "#202020",
    heading: "#111111",
    primary: "#3157c8",
    accent: "#80a3ed",
    muted: "#6b7280",
  },
  page: {
    size: "A4",
    marginTopMm: 18,
    marginRightMm: 18,
    marginBottomMm: 18,
    marginLeftMm: 18,
  },
  header: {
    enabled: true,
    leftText: "Example",
    centerText: "",
    rightText: "",
    showPageNumber: false,
  },
  footer: {
    enabled: true,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: true,
  },
};
const definition: TemplateDefinition = {
  schemaVersion: 1,
  styleVersionId: "00000000-0000-4000-8000-000000000010",
  fields: {
    title: { type: "text", label: "Title", required: true },
    showDetails: { type: "boolean", label: "Show details" },
    items: {
      type: "list",
      label: "Items",
      item: {
        type: "object",
        label: "Item",
        fields: {
          name: { type: "text", label: "Name", required: true },
          amount: {
            type: "money",
            label: "Amount",
            currency: "CHF",
            required: true,
          },
        },
      },
    },
  },
  computed: { total: { op: "sum", path: "items", valuePath: "amount" } },
  pageMasters: {
    cover: { background: "heading", color: "#ffffff" },
    standard: {},
  },
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
    {
      type: "page",
      master: "standard",
      children: [
        { type: "toc", tocDepth: 2 },
        {
          type: "repeat",
          source: "items",
          as: "item",
          children: [
            {
              type: "heading",
              level: 2,
              content: [{ type: "binding", path: "item.name" }],
            },
          ],
        },
        {
          type: "condition",
          condition: { path: "showDetails", operator: "truthy" },
          children: [
            {
              type: "paragraph",
              content: [
                { type: "text", value: "Total " },
                {
                  type: "binding",
                  path: "total",
                  format: "money",
                  currency: "CHF",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("template document renderer", () => {
  it("expands bindings, repeaters, conditions, formulas, masters and a TOC deterministically", () => {
    const input = {
      definition,
      data: {
        title: "Commercial <Review>",
        showDetails: true,
        items: [
          { name: "Design", amount: 1200 },
          { name: "Delivery", amount: 300 },
        ],
      },
      style,
      styleAssets: { logo: null, fonts: [] },
      templateAssets: { images: [] },
      locale: "fr-CH",
    };
    const first = renderTemplateDocumentHtml(input);
    const second = renderTemplateDocumentHtml(input);
    expect(first).toBe(second);
    expect(first).toContain("Commercial &lt;Review&gt;");
    expect(first).toContain("Design");
    expect(first).toContain("Delivery");
    expect(first).toContain("template-master-cover");
    expect(first).toContain("template-toc");
    expect(first).toContain('href="#heading-1"');
    expect(first).toContain('id="heading-1"');
    expect(first).toMatch(/1.?500/);
    expect(first).not.toContain("<Review>");
  });

  it("formats money and dates with the definition locale end to end", () => {
    const documentNode: TemplateDefinition["document"] = [
      {
        type: "page",
        master: "standard",
        children: [
          {
            type: "paragraph",
            content: [
              { type: "binding", path: "total", format: "money" },
              { type: "text", value: " " },
              { type: "binding", path: "when", format: "date" },
            ],
          },
        ],
      },
    ];
    const base = {
      ...definition,
      fields: {
        ...definition.fields,
        when: { type: "date", label: "When" } as const,
      },
      computed: {
        total: {
          op: "sum",
          path: "items",
          valuePath: "amount",
        } as const,
      },
      document: documentNode,
    };
    const data = {
      title: "Locale",
      when: "2026-07-21",
      items: [{ name: "Design", amount: 1200.5 }],
    };
    expect(
      renderTemplateDocumentHtml({
        definition: { ...base, locale: "en-US" },
        data,
        style,
      }),
    ).toContain("$1,200.50");
    expect(
      renderTemplateDocumentHtml({
        definition: { ...base, locale: "en-US" },
        data,
        style,
      }),
    ).toContain("Jul 21, 2026");
    const french = renderTemplateDocumentHtml({
      definition: { ...base, locale: "fr-FR" },
      data,
      style,
    });
    expect(french).not.toContain("$1,200.50");
    expect(french).toContain("21 juil. 2026");
    expect(french).toContain("200,50");
    // Explicit input locale still wins over the stored definition.
    expect(
      renderTemplateDocumentHtml({
        definition: { ...base, locale: "fr-FR" },
        data,
        style,
        locale: "de-DE",
      }),
    ).toContain("1.200,50");
  });

  it("expands header/footer tokens with the document title and localized date", () => {
    const html = renderTemplateDocumentHtml({
      definition: {
        ...definition,
        locale: "fr-FR",
        document: [
          {
            type: "page",
            master: "standard",
            children: [
              {
                type: "heading",
                content: [{ type: "binding", path: "title" }],
              },
            ],
          },
        ],
      },
      data: { title: "Titre" },
      style: {
        ...style,
        header: {
          enabled: true,
          leftText: "{title}",
          centerText: "{date}",
          rightText: "",
          showPageNumber: false,
        },
      },
      documentTitle: 'Contrat "Cadre"',
    });
    expect(html).toContain(
      '@top-left { color: #6b7280; content: "Contrat \\22 Cadre\\22 ";',
    );
    // The {date} token formats the render date with the definition locale.
    expect(html).toMatch(
      /@top-center \{ color: #6b7280; content: "\d{2} [^"]+ \d{4}";/,
    );
  });

  it("renders table footer rows and zebra striping", () => {
    const tableDefinition: TemplateDefinition = {
      ...definition,
      document: [
        {
          type: "page",
          master: "standard",
          children: [
            {
              type: "table",
              source: "items",
              zebraRows: true,
              tableColumns: [
                { header: "Name", path: "name" },
                {
                  header: "Amount",
                  path: "amount",
                  format: "money",
                  currency: "CHF",
                  align: "right",
                },
              ],
              footerRow: [{}, { path: "total" }],
            },
          ],
        },
      ],
    };
    const html = renderTemplateDocumentHtml({
      definition: tableDefinition,
      data: {
        title: "Totals",
        items: [
          { name: "Design", amount: 100 },
          { name: "Delivery", amount: 50 },
        ],
      },
      style,
    });
    expect(html).toContain('<table class="template-table-zebra">');
    expect(html).toContain("<tfoot><tr>");
    expect(html).toMatch(
      /<td style="text-align:right">CHF\u00a0?150\.00<\/td><\/tr><\/tfoot>/,
    );
    // Empty footer cells stay empty and reuse the column alignment.
    expect(html).toContain('<td style="text-align:left"></td>');
    expect(html).toContain(
      ".template-page tfoot td{border-top:2px solid #111111;font-weight:600;}",
    );
    expect(html).toContain(
      ".template-table-zebra tbody tr:nth-child(even) td{background:#6b7280;}",
    );
    // Tables without the options render exactly as before.
    const plain = renderTemplateDocumentHtml({
      definition,
      data: {
        title: "Plain",
        items: [{ name: "Design", amount: 10 }],
      },
      style,
    });
    expect(plain).not.toContain("<tfoot>");
    expect(plain).not.toContain('<table class="template-table-zebra">');
  });

  it("keeps table footer paths scoped outside repeated rows", () => {
    const nestedDefinition: TemplateDefinition = {
      ...definition,
      fields: {
        ...definition.fields,
        groups: {
          type: "list",
          label: "Groups",
          item: {
            type: "object",
            label: "Group",
            fields: {
              name: { type: "text", label: "Name" },
              rows: {
                type: "list",
                label: "Rows",
                item: {
                  type: "object",
                  label: "Row",
                  fields: {
                    amount: { type: "money", label: "Amount", currency: "CHF" },
                  },
                },
              },
            },
          },
        },
      },
      computed: { total: { op: "sum", path: "items", valuePath: "amount" } },
      document: [
        {
          type: "page",
          master: "standard",
          children: [
            {
              type: "repeat",
              source: "groups",
              as: "groupX",
              children: [
                {
                  type: "table",
                  source: "groupX.rows",
                  tableColumns: [
                    { header: "Amount", path: "amount", format: "money" },
                  ],
                  footerRow: [{ path: "total" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const html = renderTemplateDocumentHtml({
      definition: nestedDefinition,
      data: {
        title: "Groups",
        items: [{ name: "Design", amount: 5 }],
        groups: [
          { name: "A", rows: [{ amount: 1 }, { amount: 2 }] },
          { name: "B", rows: [{ amount: 3 }] },
        ],
      },
      style,
    });
    // Two repeated tables, each with a footer cell resolving the root total.
    const footers = html.match(/<tfoot><tr>/g) ?? [];
    expect(footers).toHaveLength(2);
    // Both footers resolve the root-level computed total, not row values.
    expect(html).toMatch(/<td style="text-align:left">\$5\.00<\/td>/);
  });

  it("rejects missing required business-specific data without leaking details", () => {
    expect(() =>
      renderTemplateDocumentHtml({ definition, data: {}, style }),
    ).toThrow(DocumentInputError);
  });

  it("resolves forward computed dependencies and nested typed defaults", () => {
    const computedDefinition: TemplateDefinition = {
      ...definition,
      fields: {
        ...definition.fields,
        profile: {
          type: "object",
          label: "Profile",
          default: { name: "Default name" },
          fields: {
            name: { type: "text", label: "Name", required: true },
            role: {
              type: "text",
              label: "Role",
              required: true,
              default: "Editor",
            },
          },
        },
      },
      computed: {
        grandTotal: {
          op: "add",
          left: { op: "path", path: "total" },
          right: { op: "value", value: 2 },
        },
        total: { op: "sum", path: "items", valuePath: "amount" },
      },
      document: [
        {
          type: "page",
          master: "standard",
          children: [
            {
              type: "paragraph",
              content: [
                { type: "binding", path: "profile.role" },
                { type: "text", value: ": " },
                { type: "binding", path: "grandTotal", format: "number" },
              ],
            },
          ],
        },
      ],
    };
    const html = renderTemplateDocumentHtml({
      definition: computedDefinition,
      data: { title: "Defaults", items: [{ name: "Work", amount: 10 }] },
      style,
    });
    expect(html).toContain("Editor: 12");
  });

  it("honors master-specific margins, hidden running content, and outside edges", () => {
    const html = renderTemplateDocumentHtml({
      definition: {
        ...definition,
        pageMasters: {
          standard: {
            marginTopMm: 10,
            marginBottomMm: 20,
            hideHeader: true,
            hideFooter: true,
            edgeBar: { color: "accent", widthMm: 3, side: "outside" },
          },
        },
        document: [
          {
            type: "page",
            master: "standard",
            children: [
              {
                type: "heading",
                content: [{ type: "binding", path: "title" }],
              },
            ],
          },
        ],
      },
      data: { title: "Master behavior" },
      style: { ...style, page: { ...style.page, size: "LETTER" } },
    });
    expect(html).toContain("min-height:249.4mm");
    expect(html).toContain("@top-left{content:none;}");
    expect(html).toContain("@bottom-right{content:none;}");
    expect(html).toContain("nth-of-type(even).template-master-standard");
    expect(html).toContain('data-page-content-mm="249.4"');
  });

  it("rejects undeclared values nested inside typed objects", () => {
    expect(() =>
      renderTemplateDocumentHtml({
        definition,
        data: {
          title: "Nested validation",
          items: [{ name: "Design", amount: 1200, undeclared: "hidden" }],
        },
        style,
      }),
    ).toThrow(DocumentInputError);
  });

  it("extracts only image UUIDs declared by the user field schema", () => {
    const imageDefinition: TemplateDefinition = {
      ...definition,
      fields: {
        portrait: { type: "image", label: "Portrait", required: true },
      },
      computed: undefined,
      document: [
        {
          type: "page",
          master: "standard",
          children: [{ type: "image", source: "portrait" }],
        },
      ],
    };
    const id = "00000000-0000-4000-8000-000000000099";
    expect(templateImageIds(imageDefinition, { portrait: id })).toEqual([id]);
  });
});
