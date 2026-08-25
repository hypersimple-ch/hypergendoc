import { createHash } from "node:crypto";
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
import { encodeQr } from "./vendor/qrcodegen.js";

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

  it("emits a fixed, print-safe watermark for masters that declare one", () => {
    const html = renderTemplateDocumentHtml({
      definition: {
        ...definition,
        pageMasters: {
          cover: {
            watermark: {
              text: "CONFIDENTIAL",
              tone: "warning",
              opacity: "strong",
            },
          },
          standard: {},
        },
        document: [
          {
            type: "page",
            master: "cover",
            children: [
              {
                type: "heading",
                content: [{ type: "binding", path: "title" }],
              },
            ],
          },
          {
            type: "page",
            master: "standard",
            children: [{ type: "spacer" }],
          },
        ],
      },
      data: { title: "Watermarked" },
      style,
    });
    expect(html).toContain(".template-master-cover{isolation:isolate;}");
    expect(html).toContain(
      '.template-master-cover::before{content:"CONFIDENTIAL";',
    );
    expect(html).toContain(
      "transform:translate(-50%,-50%) rotate(-30deg);font-size:48pt;",
    );
    expect(html).toContain("color:#b45309;opacity:0.28;");
    expect(html).toContain("z-index:-1;pointer-events:none;");
    expect(html).toContain("print-color-adjust:exact;");
    // Masters without a watermark stay untouched.
    expect(html).not.toContain(".template-master-standard::before");
    expect(html).not.toContain(".template-master-standard{isolation");
  });

  it("resolves hyphenated repeater aliases in bindings and conditions", () => {
    const html = renderTemplateDocumentHtml({
      definition: {
        ...definition,
        document: [
          {
            type: "page",
            master: "standard",
            children: [
              {
                type: "repeat",
                source: "items",
                as: "line-item",
                children: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "binding", path: "line-item.name" },
                      { type: "text", value: ":" },
                      { type: "binding", path: "line-item.amount" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      data: {
        title: "Hyphens",
        items: [{ name: "Design", amount: 10 }],
      },
      style,
    });
    expect(html).toContain("<p>Design:10</p>");
  });

  it("evaluates min, max, round, abs, ceil, floor, concat, and if", () => {
    const richDefinition: TemplateDefinition = {
      ...definition,
      fields: {
        ...definition.fields,
        amounts: {
          type: "list",
          label: "Amounts",
          item: { type: "money", label: "Amount", currency: "CHF" },
        },
        when: { type: "date", label: "When" },
      },
      computed: {
        total: { op: "sum", path: "items", valuePath: "amount" },
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
        magnitude: {
          op: "abs",
          value: {
            op: "subtract",
            left: { op: "value", value: 3 },
            right: { op: "path", path: "total" },
          },
        },
        ceiling: { op: "ceil", value: { op: "count", path: "items" } },
        floored: { op: "floor", value: { op: "value", value: 4.7 } },
        halfUp: { op: "round", value: { op: "value", value: 2.5 } },
        halfDown: { op: "round", value: { op: "value", value: -2.5 } },
        label: {
          op: "concat",
          parts: [
            { op: "value", value: "Total " },
            { op: "path", path: "total" },
          ],
        },
        tier: {
          op: "if",
          condition: { path: "total", operator: "gt", value: 1000 },
          then: { op: "value", value: "high" },
          otherwise: { op: "value", value: "low" },
        },
      },
      document: [
        {
          type: "page",
          master: "standard",
          children: [
            {
              type: "paragraph",
              content: [
                { type: "binding", path: "smallest", format: "number" },
                { type: "text", value: "/" },
                { type: "binding", path: "largest", format: "number" },
                { type: "text", value: "/" },
                { type: "binding", path: "rounded", format: "number" },
                { type: "text", value: "/" },
                { type: "binding", path: "magnitude", format: "number" },
                { type: "text", value: "/" },
                { type: "binding", path: "ceiling", format: "number" },
                { type: "text", value: "/" },
                { type: "binding", path: "floored", format: "number" },
                { type: "text", value: "/" },
                { type: "binding", path: "halfUp", format: "number" },
                { type: "text", value: "/" },
                { type: "binding", path: "halfDown", format: "number" },
                { type: "text", value: "/" },
                { type: "binding", path: "label" },
                { type: "text", value: "/" },
                { type: "binding", path: "tier" },
              ],
            },
          ],
        },
      ],
    };
    const html = renderTemplateDocumentHtml({
      definition: richDefinition,
      data: {
        title: "Rich",
        when: "2026-01-31",
        items: [
          { name: "Design", amount: 1200 },
          { name: "Delivery", amount: 300 },
        ],
        amounts: [12.5, 3, 40],
      },
      style,
    });
    // min over a numeric list; max of operands
    expect(html).toContain("3/1,500");
    // 1500 / 3 rounds to 500 with 2 decimals
    expect(html).toContain("/500/");
    // |3 - 1500| = 1497; ceil(count)=2; floor(4.7)=4
    expect(html).toContain("/1,497/2/4/");
    // round(2.5) -> 3 and round(-2.5) -> -3 (half away from zero)
    expect(html).toContain("/3/-3/");
    expect(html).toContain("/Total 1,500/");
    expect(html).toContain("Total 1,500/high");
    // A list path that resolves to no numeric entries at runtime degrades to
    // an empty value instead of failing or emitting NaN.
    const degraded = renderTemplateDocumentHtml({
      definition: richDefinition,
      data: {
        title: "Rich",
        when: "2026-01-31",
        items: [{ name: "Design", amount: 1200 }],
        amounts: [],
      },
      style,
    });
    expect(degraded).not.toMatch(/\bNaN\b/);
    expect(degraded).not.toContain("Infinity");
    expect(degraded).toContain("/1,200/");
  });

  it("formats concat numbers with the active locale", () => {
    const concatDefinition: TemplateDefinition = {
      ...definition,
      computed: {
        total: { op: "sum", path: "items", valuePath: "amount" },
        label: {
          op: "concat",
          parts: [
            { op: "value", value: "Sum: " },
            { op: "path", path: "total" },
            { op: "value", value: " CHF" },
          ],
        },
      },
      document: [
        {
          type: "page",
          master: "standard",
          children: [
            {
              type: "paragraph",
              content: [{ type: "binding", path: "label" }],
            },
          ],
        },
      ],
    };
    const data = {
      title: "Concat",
      items: [{ name: "Design", amount: 1200500.25 }],
    };
    expect(
      renderTemplateDocumentHtml({
        definition: { ...concatDefinition, locale: "en-US" },
        data,
        style,
      }),
    ).toContain("Sum: 1,200,500.25 CHF");
    expect(
      renderTemplateDocumentHtml({
        definition: { ...concatDefinition, locale: "de-CH" },
        data,
        style,
      }),
    // Apostrophes arrive HTML-escaped in the rendered document.
    ).toContain("Sum: 1&#39;200&#39;500.25 CHF");
    expect(
      renderTemplateDocumentHtml({
        definition: { ...concatDefinition, locale: "fr-FR" },
        data,
        style,
      }),
    ).toMatch(/Sum: 1\u202f200\u202f500,25 CHF/u);
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

  it("swaps page dimensions for landscape masters in a mixed document", () => {
    const wideTable = {
      type: "table",
      source: "items",
      tableColumns: [
        { header: "Name", path: "name" },
        { header: "Amount", path: "amount", format: "money" },
        { header: "Extra", path: "amount", format: "number" },
        { header: "Again", path: "amount", format: "number" },
      ],
    } as const;
    const mixed: TemplateDefinition = {
      ...definition,
      pageMasters: {
        portrait: {},
        landscape: { orientation: "landscape" },
      },
      document: [
        {
          type: "page",
          master: "portrait",
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
          master: "landscape",
          children: [wideTable],
        },
      ],
    };
    const html = renderTemplateDocumentHtml({
      definition: mixed,
      data: {
        title: "Mixed",
        items: [{ name: "Design", amount: 120 }],
      },
      style,
    });
    // Portrait A4 keeps 297mm height minus the 18mm style margins.
    expect(html).toContain('data-page-content-mm="261"');
    expect(html).toContain('data-page-width-mm="174"');
    // Landscape swaps width/height for content measurement and the @page rule.
    expect(html).toContain("@page landscape{size:A4 landscape;");
    const landscapeSection = html.slice(
      html.indexOf("template-master-landscape"),
    );
    expect(landscapeSection).toContain('data-page-content-mm="174"');
    expect(landscapeSection).toContain('data-page-width-mm="261"');
    // Letter sizes swap too, using the letter long/short sides.
    const letterHtml = renderTemplateDocumentHtml({
      definition: mixed,
      data: {
        title: "Mixed",
        items: [{ name: "Design", amount: 120 }],
      },
      style: { ...style, page: { ...style.page, size: "LETTER" } },
    });
    expect(letterHtml).toContain("@page landscape{size:letter landscape;");
    expect(letterHtml).toContain('data-page-content-mm="243.4"');
    expect(letterHtml).toContain('data-page-width-mm="179.9"');
  });

  it("emits constrained frame CSS for image width, radius, and token frames", () => {
    const imageFields: TemplateDefinition = {
      ...definition,
      fields: {
        ...definition.fields,
        photo: {
          type: "image",
          label: "Photo",
          required: true,
        },
      },
      document: [
        {
          type: "page",
          master: "standard",
          children: [
            {
              type: "image",
              source: "photo",
              fit: "contain",
              widthMm: 80,
              cornerRadiusMm: 4,
              frame: { color: "primary", weight: "normal" },
            },
            {
              type: "image",
              source: "photo",
            },
          ],
        },
      ],
    };
    const imageId = "99999999-9999-4999-8999-999999999999";
    const html = renderTemplateDocumentHtml({
      definition: imageFields,
      data: { title: "Framed", items: [], photo: imageId },
      style,
      templateAssets: {
        images: [
          {
            id: imageId,
            contentType: "image/png",
            byteSize: 9,
            sha256: createHash("sha256")
              .update("pngbytes!")
              .digest("hex"),
            base64: Buffer.from("pngbytes!").toString("base64"),
          },
        ],
      },
    });
    expect(html).toContain(
      'style="object-fit:contain;width:80mm;border-radius:4mm;border:0.8mm solid #3157c8"',
    );
    // Images without frame controls keep the unconstrained default markup.
    expect(html).toContain('style="object-fit:cover"');
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

  it("renders qr nodes as deterministic inline SVG", () => {
    const qrDefinition: TemplateDefinition = {
      ...definition,
      document: [
        {
          type: "page",
          master: "standard",
          children: [{ type: "qr", value: "https://example.com/pay" }],
        },
      ],
    };
    const input = {
      definition: qrDefinition,
      data: { title: "QR", items: [] },
      style,
    };
    const first = renderTemplateDocumentHtml(input);
    const second = renderTemplateDocumentHtml(input);
    expect(first).toBe(second);
    expect(first).toContain('role="img"');
    expect(first).toContain('aria-label="QR code"');
    expect(first).toContain("<title>QR code</title>");
    expect(first).toContain('shape-rendering="crispEdges"');
    expect(first).toMatch(/width="25mm" height="25mm"/);
    const code = encodeQr("https://example.com/pay", "medium");
    const span = code.size + 8;
    expect(first).toContain(`<rect width="${span}" height="${span}" fill="#ffffff"/>`);
    // Symbol size plus a 4-module quiet zone on each side.
    expect(first).toContain(`viewBox="0 0 ${span} ${span}"`);
    expect(first).toContain('class="template-qr"');
    expect(first).not.toContain("<img");
  });

  it("encodes qr symbols with finder patterns and version-matched module counts", () => {
    for (const text of ["A", "https://example.com/pay/1234567890"]) {
      const code = encodeQr(text, "medium");
      expect(code.size).toBe(17 + code.version * 4);
      // Finder patterns with separators occupy the three corners.
      const dark = (x: number, y: number) => code.getModule(x, y);
      const corners: readonly [number, number][] = [
        [3, 3],
        [code.size - 4, 3],
        [3, code.size - 4],
      ];
      for (const [cx, cy] of corners) {
        // Finder rings: dark center block, light ring, dark outer ring.
        expect(dark(cx, cy)).toBe(true);
        expect(dark(cx + 1, cy)).toBe(true);
        expect(dark(cx + 2, cy)).toBe(false);
        expect(dark(cx + 3, cy)).toBe(true);
        expect(dark(cx - 3, cy - 3)).toBe(true);
        // Light separator ring just outside the finder.
        for (const [dx, dy] of [
          [4, 0],
          [-4, 0],
          [0, 4],
          [0, -4],
        ] as const) {
          if (
            cx + dx >= 0 &&
            cx + dx < code.size &&
            cy + dy >= 0 &&
            cy + dy < code.size
          )
            expect(dark(cx + dx, cy + dy)).toBe(false);
        }
      }
      // Timing pattern alternation through the middle row and column.
      for (let i = 8; i < code.size - 8; i++)
        expect(dark(6, i)).toBe(i % 2 === 0);
      for (let i = 8; i < code.size - 8; i++)
        expect(dark(i, 6)).toBe(i % 2 === 0);
    }
    expect(encodeQr("A", "medium").version).toBe(1);
    // Larger payloads select the smallest fitting version.
    expect(
      encodeQr("x".repeat(200), "quartile").version,
    ).toBeGreaterThanOrEqual(10);
    expect(() => encodeQr("x".repeat(3000), "high")).toThrow(RangeError);
  });

  it("varies qr output with sizeMm, errorCorrection, source bindings, and captions", () => {
    const renderWith = (children: readonly unknown[]) =>
      renderTemplateDocumentHtml({
        definition: {
          ...definition,
          document: [
            { type: "page", master: "standard", children } as never,
          ],
        },
        data: {
          title: "QR",
          items: [],
        },
        style,
      });
    const base = { type: "qr", value: "https://example.com/pay" };
    const small = renderWith([{ ...base, sizeMm: 12 }]);
    const large = renderWith([{ ...base, sizeMm: 80 }]);
    expect(small).toContain('width="12mm"');
    expect(large).toContain('width="80mm"');
    expect(small).not.toBe(large);

    const medium = renderWith([base]);
    const high = renderWith([
      { ...base, errorCorrection: "high" },
    ]);
    expect(high).not.toBe(medium);

    const captioned = renderWith([
      {
        ...base,
        sizeMm: 30,
        caption: [
          { type: "text", value: "Pay " },
          { type: "binding", path: "title" },
        ],
      },
    ]);
    expect(captioned).toContain('aria-label="Pay QR"');
    expect(captioned).toContain("<figcaption>Pay QR</figcaption>");
    expect(captioned).toContain('width="30mm"');

    // Bound text sources resolve at render time.
    const bound = renderWith([{ type: "qr", source: "title" }]);
    expect(bound).toContain("template-qr");
    expect(bound).toContain('aria-label="QR code"');
    // A binding that resolves to no value renders nothing.
    const optionalSource: TemplateDefinition = {
      ...definition,
      fields: { note: { type: "text", label: "Note" } },
      computed: undefined,
      document: [
        {
          type: "page",
          master: "standard",
          children: [{ type: "qr", source: "note" }],
        },
      ],
    };
    const unbound = renderTemplateDocumentHtml({
      definition: optionalSource,
      data: {},
      style,
    });
    expect(unbound).not.toContain('<figure class="template-qr">');
  });
});
