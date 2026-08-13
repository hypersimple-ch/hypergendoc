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
