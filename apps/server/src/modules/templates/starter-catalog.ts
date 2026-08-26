import {
  TemplateDefinitionSchema,
  type TemplateData,
  type TemplateDefinition,
} from "@hypergendoc/contracts";

/**
 * Placeholders replaced at instantiation time: every starter ships without a
 * style pin because `styleVersionId` is chosen by the caller when creating a
 * real template from a starter.
 */
export const STARTER_STYLE_VERSION_ID = "00000000-0000-4000-8000-000000000000";

export interface StarterTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Complete definition except `styleVersionId`, which is pinned on creation. */
  readonly definition: TemplateDefinition;
  /** Realistic preview data matching the declared fields. */
  readonly sampleData: TemplateData;
}

const onePageProposal: TemplateDefinition = {
  schemaVersion: 1,
  styleVersionId: STARTER_STYLE_VERSION_ID,
  description:
    "A single-page client proposal: cover heading, introduction, scope of work, investment table, and next steps.",
  fields: {
    clientName: { type: "text", label: "Client name", required: true },
    preparedBy: { type: "text", label: "Prepared by" },
    proposalDate: { type: "date", label: "Proposal date" },
    intro: {
      type: "richText",
      label: "Introduction",
      required: true,
      default:
        "<p>We are excited to share our proposal for your upcoming project.</p>",
    },
    scopeItems: {
      type: "list",
      label: "Scope of work",
      required: true,
      item: { type: "text", label: "Scope item", required: true },
    },
    investmentRows: {
      type: "list",
      label: "Investment lines",
      required: true,
      item: {
        type: "object",
        label: "Investment line",
        fields: {
          label: { type: "text", label: "Item", required: true },
          amount: { type: "money", label: "Amount", required: true },
        },
      },
    },
    nextSteps: { type: "richText", label: "Next steps" },
  },
  computed: {
    total: { op: "sum", path: "investmentRows", valuePath: "amount" },
  },
  pageMasters: { standard: {} },
  document: [
    {
      type: "page",
      master: "standard",
      children: [
        {
          type: "heading",
          id: "proposal-cover",
          level: 1,
          content: [
            { type: "text", value: "Proposal for " },
            { type: "binding", path: "clientName" },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", value: "Prepared by " },
            { type: "binding", path: "preparedBy" },
            { type: "text", value: " on " },
            { type: "binding", path: "proposalDate", format: "date" },
          ],
        },
        {
          type: "section",
          id: "introduction",
          children: [
            {
              type: "heading",
              level: 2,
              content: [{ type: "text", value: "Introduction" }],
            },
            { type: "richText", source: "intro" },
          ],
        },
        {
          type: "section",
          id: "scope-of-work",
          children: [
            {
              type: "heading",
              level: 2,
              content: [{ type: "text", value: "Scope of work" }],
            },
            { type: "list", source: "scopeItems", ordered: true },
          ],
        },
        {
          type: "section",
          id: "investment",
          children: [
            {
              type: "heading",
              level: 2,
              content: [{ type: "text", value: "Investment" }],
            },
            {
              type: "table",
              source: "investmentRows",
              zebraRows: true,
              tableColumns: [
                { header: "Item", path: "label" },
                { header: "Amount", path: "amount", format: "money", align: "right" },
              ],
              footerRow: [{}, { path: "total" }],
            },
          ],
        },
        {
          type: "section",
          id: "next-steps",
          children: [
            {
              type: "heading",
              level: 2,
              content: [{ type: "text", value: "Next steps" }],
            },
            { type: "richText", source: "nextSteps" },
          ],
        },
      ],
    },
  ],
};

const itemizedQuote: TemplateDefinition = {
  schemaVersion: 1,
  styleVersionId: STARTER_STYLE_VERSION_ID,
  description:
    "An itemized quote with repeatable line items, computed subtotal, tax, and total with a table footer row.",
  fields: {
    clientName: { type: "text", label: "Client name", required: true },
    quoteNumber: { type: "text", label: "Quote number", required: true },
    quoteDate: { type: "date", label: "Quote date", required: true },
    validUntil: { type: "date", label: "Valid until" },
    lineItems: {
      type: "list",
      label: "Line items",
      required: true,
      item: {
        type: "object",
        label: "Line item",
        fields: {
          description: { type: "text", label: "Description", required: true },
          quantity: {
            type: "number",
            label: "Quantity",
            required: true,
            default: 1,
          },
          unitPrice: { type: "money", label: "Unit price", required: true },
          amount: {
            type: "money",
            label: "Line amount",
            required: true,
            description: "Quantity multiplied by the unit price",
          },
        },
      },
    },
    taxRate: {
      type: "number",
      label: "Tax rate",
      required: true,
      default: 0.2,
      description: "Tax rate as a decimal fraction, e.g. 0.2 for 20%",
    },
  },
  computed: {
    subtotal: { op: "sum", path: "lineItems", valuePath: "amount" },
    tax: { op: "multiply", left: { op: "path", path: "subtotal" }, right: { op: "path", path: "taxRate" } },
    total: { op: "add", left: { op: "path", path: "subtotal" }, right: { op: "path", path: "tax" } },
  },
  pageMasters: { standard: {} },
  document: [
    {
      type: "page",
      master: "standard",
      children: [
        {
          type: "heading",
          id: "quote-title",
          level: 1,
          content: [
            { type: "text", value: "Quote " },
            { type: "binding", path: "quoteNumber" },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", value: "For " },
            { type: "binding", path: "clientName", strong: true },
            { type: "text", value: " · quoted on " },
            { type: "binding", path: "quoteDate", format: "date" },
            { type: "text", value: " · valid until " },
            { type: "binding", path: "validUntil", format: "date" },
          ],
        },
        {
          type: "table",
          source: "lineItems",
          zebraRows: true,
          tableColumns: [
            { header: "Description", path: "description" },
            { header: "Qty", path: "quantity", format: "number", align: "right" },
            { header: "Unit price", path: "unitPrice", format: "money", align: "right" },
            { header: "Amount", path: "amount", format: "money", align: "right" },
          ],
          footerRow: [{}, {}, {}, { path: "total" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", value: "Subtotal: " },
            { type: "binding", path: "subtotal", format: "money" },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", value: "Tax: " },
            { type: "binding", path: "tax", format: "money" },
          ],
        },
      ],
    },
  ],
};

const projectInvoice: TemplateDefinition = {
  schemaVersion: 1,
  styleVersionId: STARTER_STYLE_VERSION_ID,
  locale: "en",
  description:
    "A project invoice with invoice metadata, bill-to details, money-formatted line items, totals, payment terms, and an optional watermarked copy master.",
  fields: {
    invoiceNumber: { type: "text", label: "Invoice number", required: true },
    issueDate: { type: "date", label: "Issue date", required: true },
    dueDate: { type: "date", label: "Due date", required: true },
    poNumber: { type: "text", label: "PO number" },
    billTo: {
      type: "object",
      label: "Bill to",
      required: true,
      fields: {
        name: { type: "text", label: "Name", required: true },
        address: { type: "text", label: "Address" },
        email: { type: "text", label: "Email" },
      },
    },
    lineItems: {
      type: "list",
      label: "Invoice lines",
      required: true,
      item: {
        type: "object",
        label: "Invoice line",
        fields: {
          description: { type: "text", label: "Description", required: true },
          amount: { type: "money", label: "Amount", required: true },
        },
      },
    },
    notes: {
      type: "richText",
      label: "Payment terms",
      default:
        "<p>Payment is due within 30 days of the issue date by bank transfer.</p>",
    },
  },
  computed: {
    itemCount: { op: "count", path: "lineItems" },
    totalDue: { op: "sum", path: "lineItems", valuePath: "amount" },
  },
  pageMasters: {
    standard: {},
    stamped: {
      watermark: { text: "COPY", tone: "neutral", opacity: "subtle" },
    },
  },
  document: [
    {
      type: "page",
      master: "standard",
      children: [
        {
          type: "heading",
          id: "invoice-title",
          level: 1,
          content: [
            { type: "text", value: "Invoice " },
            { type: "binding", path: "invoiceNumber" },
          ],
        },
        {
          type: "grid",
          columns: 2,
          children: [
            {
              type: "stack",
              gapMm: 2,
              children: [
                {
                  type: "heading",
                  level: 3,
                  content: [{ type: "text", value: "Bill to" }],
                },
                {
                  type: "paragraph",
                  content: [
                    { type: "binding", path: "billTo.name", strong: true },
                  ],
                },
                {
                  type: "paragraph",
                  content: [{ type: "binding", path: "billTo.address" }],
                },
                {
                  type: "paragraph",
                  content: [{ type: "binding", path: "billTo.email" }],
                },
              ],
            },
            {
              type: "stack",
              gapMm: 2,
              children: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", value: "Issued: " },
                    { type: "binding", path: "issueDate", format: "date" },
                  ],
                },
                {
                  type: "paragraph",
                  content: [
                    { type: "text", value: "Due: " },
                    { type: "binding", path: "dueDate", format: "date" },
                  ],
                },
                {
                  type: "paragraph",
                  content: [
                    { type: "text", value: "PO: " },
                    { type: "binding", path: "poNumber" },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "table",
          source: "lineItems",
          zebraRows: true,
          tableColumns: [
            { header: "Description", path: "description" },
            { header: "Amount", path: "amount", format: "money", align: "right" },
          ],
          footerRow: [{}, { path: "totalDue" }],
        },
        {
          type: "section",
          id: "payment-terms",
          children: [
            {
              type: "heading",
              level: 2,
              content: [{ type: "text", value: "Payment terms" }],
            },
            { type: "richText", source: "notes" },
          ],
        },
      ],
    },
  ],
};

const statusReport: TemplateDefinition = {
  schemaVersion: 1,
  styleVersionId: STARTER_STYLE_VERSION_ID,
  description:
    "A short status report with reporting period, health conditions, summary, and a milestone list with status-driven emphasis.",
  fields: {
    projectName: { type: "text", label: "Project name", required: true },
    periodStart: { type: "date", label: "Period start", required: true },
    periodEnd: { type: "date", label: "Period end", required: true },
    health: {
      type: "text",
      label: "Overall health",
      required: true,
      default: "on-track",
      options: ["on-track", "at-risk", "off-track"],
    },
    summary: { type: "richText", label: "Executive summary", required: true },
    milestones: {
      type: "list",
      label: "Milestones",
      required: true,
      item: {
        type: "object",
        label: "Milestone",
        fields: {
          name: { type: "text", label: "Name", required: true },
          status: {
            type: "text",
            label: "Status",
            required: true,
            default: "not-started",
            options: ["not-started", "in-progress", "complete", "at-risk"],
          },
          due: { type: "date", label: "Due date" },
        },
      },
    },
  },
  computed: {
    milestoneCount: { op: "count", path: "milestones" },
  },
  pageMasters: { standard: {} },
  document: [
    {
      type: "page",
      master: "standard",
      children: [
        {
          type: "heading",
          id: "report-title",
          level: 1,
          content: [
            { type: "binding", path: "projectName" },
            { type: "text", value: " — status report" },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", value: "Reporting period: " },
            { type: "binding", path: "periodStart", format: "date" },
            { type: "text", value: " to " },
            { type: "binding", path: "periodEnd", format: "date" },
            { type: "text", value: " · " },
            { type: "binding", path: "milestoneCount", format: "number" },
            { type: "text", value: " milestones tracked" },
          ],
        },
        {
          type: "condition",
          condition: { path: "health", operator: "notEquals", value: "on-track" },
          children: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  value: "This project needs attention.",
                  strong: true,
                  color: "accent",
                },
              ],
            },
          ],
        },
        {
          type: "section",
          id: "summary",
          children: [
            {
              type: "heading",
              level: 2,
              content: [{ type: "text", value: "Summary" }],
            },
            { type: "richText", source: "summary" },
          ],
        },
        {
          type: "section",
          id: "milestones",
          children: [
            {
              type: "heading",
              level: 2,
              content: [{ type: "text", value: "Milestones" }],
            },
            {
              type: "repeat",
              source: "milestones",
              as: "milestone",
              children: [
                {
                  type: "stack",
                  gapMm: 1,
                  children: [
                    {
                      type: "paragraph",
                      content: [
                        { type: "binding", path: "milestone.name", strong: true },
                        { type: "text", value: " — " },
                        { type: "binding", path: "milestone.status" },
                      ],
                    },
                    {
                      type: "condition",
                      condition: {
                        path: "milestone.status",
                        operator: "equals",
                        value: "at-risk",
                      },
                      children: [
                        {
                          type: "paragraph",
                          content: [
                            {
                              type: "text",
                              value: "Needs attention",
                              emphasis: true,
                              color: "accent",
                            },
                          ],
                        },
                      ],
                    },
                    {
                      type: "condition",
                      condition: {
                        path: "milestone.due",
                        operator: "truthy",
                      },
                      children: [
                        {
                          type: "paragraph",
                          content: [
                            { type: "text", value: "Due ", color: "muted" },
                            {
                              type: "binding",
                              path: "milestone.due",
                              format: "date",
                              color: "muted",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const caseStudy: TemplateDefinition = {
  schemaVersion: 1,
  styleVersionId: STARTER_STYLE_VERSION_ID,
  description:
    "A client case study with hero image, challenge/approach/result narrative, pull quote, and a metrics table.",
  fields: {
    clientName: { type: "text", label: "Client name", required: true },
    headline: { type: "text", label: "Headline", required: true },
    heroImage: { type: "image", label: "Hero image", required: true },
    heroAlt: { type: "text", label: "Hero image alt text" },
    heroCaption: { type: "text", label: "Hero image caption" },
    challenge: { type: "richText", label: "Challenge", required: true },
    approach: { type: "richText", label: "Approach", required: true },
    results: { type: "richText", label: "Results", required: true },
    pullQuote: { type: "text", label: "Pull quote", required: true },
    quoteAttribution: { type: "text", label: "Quote attribution" },
    metrics: {
      type: "list",
      label: "Key metrics",
      required: true,
      item: {
        type: "object",
        label: "Metric",
        fields: {
          label: { type: "text", label: "Label", required: true },
          value: { type: "text", label: "Value", required: true },
        },
      },
    },
  },
  pageMasters: { standard: {} },
  document: [
    {
      type: "page",
      master: "standard",
      children: [
        {
          type: "heading",
          id: "case-study-headline",
          level: 1,
          content: [{ type: "binding", path: "headline" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", value: "A case study with " },
            { type: "binding", path: "clientName", strong: true },
          ],
        },
        {
          type: "image",
          source: "heroImage",
          fit: "cover",
          heightMm: 80,
          altPath: "heroAlt",
          caption: [{ type: "binding", path: "heroCaption" }],
        },
        {
          type: "section",
          id: "challenge",
          children: [
            {
              type: "heading",
              level: 2,
              content: [{ type: "text", value: "The challenge" }],
            },
            { type: "richText", source: "challenge" },
          ],
        },
        {
          type: "divider",
        },
        {
          type: "paragraph",
          content: [
            { type: "binding", path: "pullQuote", emphasis: true, color: "primary" },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", value: "— ", color: "muted" },
            { type: "binding", path: "quoteAttribution", color: "muted" },
          ],
        },
        {
          type: "divider",
        },
        {
          type: "section",
          id: "approach",
          children: [
            {
              type: "heading",
              level: 2,
              content: [{ type: "text", value: "Our approach" }],
            },
            { type: "richText", source: "approach" },
          ],
        },
        {
          type: "section",
          id: "results",
          children: [
            {
              type: "heading",
              level: 2,
              content: [{ type: "text", value: "The results" }],
            },
            { type: "richText", source: "results" },
            {
              type: "table",
              source: "metrics",
              tableColumns: [
                { header: "Metric", path: "label" },
                { header: "Result", path: "value", align: "right" },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/** Fail fast at module load if a starter drifts invalid after contract changes. */
function assertValidStarter(starter: StarterTemplate): void {
  TemplateDefinitionSchema.parse(starter.definition);
}

const starterList: readonly StarterTemplate[] = [
  {
      id: "one-page-proposal",
      name: "One-page proposal",
      description: onePageProposal.description!,
      definition: onePageProposal,
      sampleData: {
        clientName: "Northwind Studio",
        preparedBy: "Ada Quinn",
        proposalDate: "2026-03-02",
        intro:
          "<p>We propose a six-week engagement to refresh Northwind Studio's brand and website.</p>",
        scopeItems: [
          "Discovery workshop",
          "Brand identity concept",
          "Website design and handoff",
        ],
        investmentRows: [
          { label: "Discovery workshop", amount: 2500 },
          { label: "Brand identity concept", amount: 4500 },
          { label: "Website design and handoff", amount: 6500 },
        ],
        nextSteps:
          "<p>Reply with your approval or questions and we will schedule the kickoff workshop.</p>",
      },
    },
    {
      id: "itemized-quote",
      name: "Itemized quote",
      description: itemizedQuote.description!,
      definition: itemizedQuote,
      sampleData: {
        clientName: "Beacon Labs",
        quoteNumber: "Q-2026-041",
        quoteDate: "2026-03-05",
        validUntil: "2026-04-04",
        lineItems: [
          { description: "Content audit", quantity: 1, unitPrice: 1800, amount: 1800 },
          { description: "Design system screens", quantity: 12, unitPrice: 350, amount: 4200 },
          { description: "Accessibility review", quantity: 2, unitPrice: 600, amount: 1200 },
        ],
        taxRate: 0.2,
      },
    },
    {
      id: "project-invoice",
      name: "Project invoice",
      description: projectInvoice.description!,
      definition: projectInvoice,
      sampleData: {
        invoiceNumber: "INV-2026-014",
        issueDate: "2026-03-15",
        dueDate: "2026-04-14",
        poNumber: "PO-8841",
        billTo: {
          name: "Harbor & Finch Ltd.",
          address: "42 Quay Street, Portsmouth",
          email: "accounts@harborfinch.example",
        },
        lineItems: [
          { description: "Phase 1 — Research and strategy", amount: 5200 },
          { description: "Phase 2 — Design sprints", amount: 7400 },
        ],
        notes:
          "<p>Payment is due within 30 days by bank transfer. Late payments accrue 2% monthly interest.</p>",
      },
    },
    {
      id: "status-report",
      name: "Status report",
      description: statusReport.description!,
      definition: statusReport,
      sampleData: {
        projectName: "Atlas Replatform",
        periodStart: "2026-02-24",
        periodEnd: "2026-03-09",
        health: "at-risk",
        summary:
          "<p>Design delivery is on schedule; integration testing is two days behind pending vendor credentials.</p>",
        milestones: [
          { name: "Information architecture sign-off", status: "complete", due: "2026-02-27" },
          { name: "Component library build", status: "in-progress", due: "2026-03-20" },
          { name: "Vendor sandbox integration", status: "at-risk", due: "2026-03-13" },
          { name: "Launch readiness review", status: "not-started", due: "2026-04-10" },
        ],
      },
    },
    {
      id: "case-study",
      name: "Case study",
      description: caseStudy.description!,
      definition: caseStudy,
      sampleData: {
        clientName: "Fernwood Outfitters",
        headline: "Replatforming Fernwood's storefront without losing a day of sales",
        heroImage: "11111111-1111-4111-8111-111111111111",
        heroAlt: "Fernwood flagship store interior",
        heroCaption: "The flagship store that inspired the new digital brand.",
        challenge:
          "<p>Fernwood's legacy storefront could not keep up with seasonal traffic and made campaigns expensive to launch.</p>",
        pullQuote: "We finally ship campaigns in hours, not weeks.",
        quoteAttribution: "Maya Okafor, Head of Digital, Fernwood Outfitters",
        approach:
          "<p>We migrated the catalogue incrementally behind a feature-flagged edge layer and redesigned checkout around a single-page flow.</p>",
        results:
          "<p>The replatform completed with zero downtime during peak season and campaign launch effort dropped dramatically.</p>",
        metrics: [
          { label: "Peak-season downtime", value: "0 minutes" },
          { label: "Campaign launch time", value: "-85%" },
          { label: "Checkout conversion", value: "+18%" },
        ],
      },
    },
];

export const starterTemplates = starterList.map((entry) => {
  assertValidStarter(entry);
  return entry;
});

export function findStarterTemplate(
  starterId: string,
): StarterTemplate | undefined {
  return starterTemplates.find((starter) => starter.id === starterId);
}

export interface StarterTemplateSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly fieldCount: number;
  readonly fieldKinds: readonly string[];
  readonly definition: TemplateDefinition;
  readonly sampleData: TemplateData;
}

const fieldKindLeaves = (
  fields: TemplateDefinition["fields"],
): string[] => {
  const kinds: string[] = [];
  for (const field of Object.values(fields)) {
    kinds.push(field.type);
    if (field.fields) kinds.push(...fieldKindLeaves(field.fields));
    if (field.item) kinds.push(field.item.type);
  }
  return kinds.sort();
};

/** Catalog payload served by GET /api/starter-templates. */
export function listStarterTemplates(): readonly StarterTemplateSummary[] {
  return starterTemplates.map((starter) => ({
    id: starter.id,
    name: starter.name,
    description: starter.description,
    fieldCount: Object.keys(starter.definition.fields).length,
    fieldKinds: [...new Set(fieldKindLeaves(starter.definition.fields))],
    definition: starter.definition,
    sampleData: starter.sampleData,
  }));
}
