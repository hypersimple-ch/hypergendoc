import {
  TemplateDefinitionSchema,
  type TemplateDefinition,
  type TemplateValue,
} from "@hypergendoc/contracts";
import { describe, expect, it } from "vitest";
import {
  listStarterTemplates,
  STARTER_STYLE_VERSION_ID,
  starterTemplates,
} from "./starter-catalog.js";

/** Mirrors the contract's closed-object/list semantics for sample data. */
function sampleDataMatchesFields(
  fields: TemplateDefinition["fields"],
  value: TemplateValue | undefined,
): boolean {
  if (value === undefined || value === null || typeof value !== "object")
    return false;
  const record = value as Record<string, TemplateValue>;
  return Object.entries(fields).every(([name, field]) => {
    const current = record[name];
    switch (field.type) {
      case "text":
      case "richText":
      case "date":
        return typeof current === "string";
      case "number":
      case "money":
        return typeof current === "number" && Number.isFinite(current);
      case "boolean":
        return typeof current === "boolean";
      case "image":
        return (
          typeof current === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            current,
          )
        );
      case "object":
        return field.fields
          ? sampleDataMatchesFields(field.fields, current)
          : false;
      case "list":
        return (
          Boolean(field.item) &&
          Array.isArray(current) &&
          current.every((item) =>
            sampleDataMatchesFields(
              { item: field.item! },
              { item: item as TemplateValue },
            ),
          )
        );
    }
  });
}

/** Collects every root segment referenced by bindings, sources, conditions, and footer cells. */
function referencedRoots(nodes: TemplateDefinition["document"]): string[] {
  const roots: string[] = [];
  const walk = (
    values: readonly TemplateValue[] | undefined,
    aliases: ReadonlySet<string>,
  ) => {
    for (const value of values ?? []) {
      if (value === null || typeof value !== "object") continue;
      const node = value as Record<string, TemplateValue>;
      const localAliases = new Set([
        ...aliases,
        ...(typeof node.as === "string" ? [node.as] : []),
      ]);
      const reference = (path: unknown) => {
        if (typeof path !== "string") return;
        const root = path.split(".")[0]!;
        // Repeat aliases resolve inside the contract validator; the catalog
        // only needs to prove starters stay within declared top-level names.
        if (!aliases.has(root)) roots.push(root);
      };
      if (Array.isArray(node.content)) walk(node.content, localAliases);
      if (Array.isArray(node.caption)) walk(node.caption, localAliases);
      if (Array.isArray(node.children)) walk(node.children, localAliases);
      if (Array.isArray(node.tableColumns))
        for (const column of node.tableColumns as readonly Record<string, unknown>[])
          reference(column.path);
      if (Array.isArray(node.footerRow))
        for (const cell of node.footerRow as readonly Record<string, unknown>[])
          reference(cell.path);
      reference(node.source);
      reference(node.itemsPath);
      reference(node.altPath);
      if (node.condition && typeof node.condition === "object")
        reference((node.condition as Record<string, unknown>).path);
      if (typeof node.component === "string" && node.component)
        roots.push(`component:${node.component}`);
    }
  };
  walk(values2nodes(nodes), new Set());
  return roots;
}

// The AST is structurally compatible with TemplateValue traversal.
const values2nodes = (nodes: unknown): readonly TemplateValue[] =>
  nodes as readonly TemplateValue[];

describe("starter template catalog", () => {
  it("exposes exactly five unique starters with stable identities", () => {
    expect(starterTemplates.map((starter) => starter.id)).toEqual([
      "one-page-proposal",
      "itemized-quote",
      "project-invoice",
      "status-report",
      "case-study",
    ]);
    expect(new Set(starterTemplates.map((s) => s.name)).size).toBe(
      starterTemplates.length,
    );
  });

  it("validates every starter against the authoritative contract validator", () => {
    for (const starter of starterTemplates) {
      const parsed = TemplateDefinitionSchema.safeParse(starter.definition);
      expect(parsed.success, `${starter.id} must validate`).toBe(true);
      expect(starter.definition.styleVersionId).toBe(
        STARTER_STYLE_VERSION_ID,
      );
    }
  });

  it("ships sample data that satisfies each declared field", () => {
    for (const starter of starterTemplates) {
      expect(
        sampleDataMatchesFields(
          starter.definition.fields,
          starter.sampleData,
        ),
        `${starter.id} sample data must match its fields`,
      ).toBe(true);
    }
  });

  it("references only declared fields, computed values, components, or repeat aliases", () => {
    for (const starter of starterTemplates) {
      const declared = new Set([
        ...Object.keys(starter.definition.fields),
        ...Object.keys(starter.definition.computed ?? {}),
        "index",
      ]);
      const components = new Set(Object.keys(starter.definition.components ?? {}));
      const roots = referencedRoots([starter.definition.document as never]);
      for (const root of roots) {
        if (root.startsWith("component:")) {
          expect(components.has(root.slice("component:".length))).toBe(true);
        } else {
          expect(declared.has(root), `${starter.id} references "${root}"`).toBe(
            true,
          );
        }
      }
    }
  });

  it("showcases the current capability set where it fits", () => {
    const byId = new Map(starterTemplates.map((s) => [s.id, s]));
    const quote = byId.get("itemized-quote")!;
    const tables = JSON.stringify(quote.definition.document);
    expect(tables).toContain('"footerRow"');
    expect(tables).toContain('"zebraRows":true');
    expect(quote.definition.computed?.subtotal?.op).toBe("sum");
    expect(quote.definition.computed?.tax?.op).toBe("multiply");
    const invoice = byId.get("project-invoice")!;
    expect(JSON.stringify(invoice.definition.pageMasters)).toContain(
      '"watermark"',
    );
    expect(invoice.definition.locale).toBe("en");
  });

  it("keeps the served catalog payload under 100 KiB", () => {
    const payload = JSON.stringify(listStarterTemplates());
    expect(Buffer.byteLength(payload, "utf8")).toBeLessThan(100 * 1024);
  });
});
