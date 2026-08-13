import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";

export const TEMPLATE_DEFINITION_MAX_BYTES = 512 * 1024;
export const TEMPLATE_DATA_MAX_BYTES = 256 * 1024;

export type TemplateScalar = string | number | boolean | null;
export type TemplateValue =
  | TemplateScalar
  | readonly TemplateValue[]
  | { readonly [key: string]: TemplateValue };

export const TemplateValueSchema: z.ZodType<TemplateValue> = z.lazy(() =>
  z.union([
    z.string().max(100_000),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(TemplateValueSchema).max(500),
    z.record(TemplateIdentifierSchema, TemplateValueSchema),
  ]),
);

const byteLength = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

const TemplateIdentifierSchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const TemplatePathSchema = z
  .string()
  .max(256)
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z][a-zA-Z0-9_-]*)*$/);

export const TemplateDataSchema = z
  .record(z.string().min(1).max(64), TemplateValueSchema)
  .refine((value) => byteLength(value) <= TEMPLATE_DATA_MAX_BYTES, {
    message: "Template data exceeds 256 KiB UTF-8",
  });

export type TemplateFieldDefinition = Readonly<{
  type:
    | "text"
    | "richText"
    | "number"
    | "boolean"
    | "date"
    | "money"
    | "image"
    | "object"
    | "list";
  label: string;
  description?: string | undefined;
  required?: boolean | undefined;
  default?: TemplateValue | undefined;
  currency?: string | undefined;
  options?: readonly string[] | undefined;
  fields?: Readonly<Record<string, TemplateFieldDefinition>> | undefined;
  item?: TemplateFieldDefinition | undefined;
}>;

const fieldValueMatchesDefinition = (
  field: TemplateFieldDefinition,
  value: TemplateValue | undefined,
  depth = 0,
): boolean => {
  if (depth > 32 || value === undefined || value === null)
    return !field.required;
  if (
    field.options &&
    (typeof value !== "string" || !field.options.includes(value))
  )
    return false;
  switch (field.type) {
    case "text":
    case "richText":
    case "date":
      return typeof value === "string";
    case "image":
      return typeof value === "string" && UuidSchema.safeParse(value).success;
    case "number":
    case "money":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "object": {
      if (!field.fields || typeof value !== "object" || Array.isArray(value))
        return false;
      const record = value as Readonly<Record<string, TemplateValue>>;
      return (
        Object.keys(record).every((key) => key in field.fields!) &&
        Object.entries(field.fields).every(([key, child]) =>
          fieldValueMatchesDefinition(
            child,
            record[key] ?? child.default,
            depth + 1,
          ),
        )
      );
    }
    case "list": {
      const itemDefinition = field.item;
      if (!itemDefinition || !Array.isArray(value)) return false;
      const list = value as readonly TemplateValue[];
      return list.every((item) =>
        fieldValueMatchesDefinition(itemDefinition, item, depth + 1),
      );
    }
  }
};

export const TemplateFieldDefinitionSchema: z.ZodType<TemplateFieldDefinition> =
  z.lazy(() =>
    z
      .object({
        type: z.enum([
          "text",
          "richText",
          "number",
          "boolean",
          "date",
          "money",
          "image",
          "object",
          "list",
        ]),
        label: z.string().trim().min(1).max(120),
        description: z.string().max(500).optional(),
        required: z.boolean().optional(),
        default: TemplateValueSchema.optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
        options: z.array(z.string().max(200)).max(100).optional(),
        fields: z
          .record(TemplateIdentifierSchema, TemplateFieldDefinitionSchema)
          .optional(),
        item: TemplateFieldDefinitionSchema.optional(),
      })
      .strict()
      .superRefine((field, context) => {
        if (field.type === "object" && !field.fields)
          context.addIssue({
            code: "custom",
            message: "Object fields are required",
          });
        if (field.type === "list" && !field.item)
          context.addIssue({
            code: "custom",
            message: "List item is required",
          });
        if (field.type !== "object" && field.fields)
          context.addIssue({
            code: "custom",
            message: "Only objects have fields",
          });
        if (field.type !== "list" && field.item)
          context.addIssue({
            code: "custom",
            message: "Only lists have an item",
          });
        if (field.currency && field.type !== "money")
          context.addIssue({
            code: "custom",
            message: "Currency requires money",
          });
        if (field.options && field.type !== "text")
          context.addIssue({
            code: "custom",
            message: "Options require a text field",
          });
        if (
          field.default !== undefined &&
          !fieldValueMatchesDefinition(field, field.default)
        )
          context.addIssue({
            code: "custom",
            path: ["default"],
            message: "Default does not match the field type",
          });
      }),
  );

export type TemplateExpression =
  | { readonly op: "value"; readonly value: TemplateValue }
  | { readonly op: "path"; readonly path: string }
  | {
      readonly op: "add" | "subtract" | "multiply" | "divide";
      readonly left: TemplateExpression;
      readonly right: TemplateExpression;
    }
  | {
      readonly op: "sum";
      readonly path: string;
      readonly valuePath?: string | undefined;
    }
  | {
      readonly op: "count";
      readonly path: string;
    }
  | {
      readonly op: "dateAdd";
      readonly path: string;
      readonly days: TemplateExpression;
    };

export const TemplateExpressionSchema: z.ZodType<TemplateExpression> = z.lazy(
  () =>
    z.union([
      z.object({ op: z.literal("value"), value: TemplateValueSchema }).strict(),
      z.object({ op: z.literal("path"), path: TemplatePathSchema }).strict(),
      z
        .object({
          op: z.enum(["add", "subtract", "multiply", "divide"]),
          left: TemplateExpressionSchema,
          right: TemplateExpressionSchema,
        })
        .strict(),
      z
        .object({
          op: z.literal("sum"),
          path: TemplatePathSchema,
          valuePath: TemplatePathSchema.optional(),
        })
        .strict(),
      z.object({ op: z.literal("count"), path: TemplatePathSchema }).strict(),
      z
        .object({
          op: z.literal("dateAdd"),
          path: TemplatePathSchema,
          days: TemplateExpressionSchema,
        })
        .strict(),
    ]),
);

export const TemplateConditionSchema = z
  .object({
    path: TemplatePathSchema,
    operator: z
      .enum([
        "truthy",
        "falsy",
        "equals",
        "notEquals",
        "contains",
        "gt",
        "gte",
        "lt",
        "lte",
      ])
      .default("truthy"),
    value: TemplateValueSchema.optional(),
  })
  .strict();
export type TemplateCondition = z.infer<typeof TemplateConditionSchema>;

export const TemplateInlineSchema = z
  .object({
    type: z.enum(["text", "binding"]),
    value: z.string().max(20_000).optional(),
    path: TemplatePathSchema.optional(),
    format: z.enum(["text", "date", "number", "money"]).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    strong: z.boolean().optional(),
    emphasis: z.boolean().optional(),
    color: z.enum(["text", "heading", "primary", "accent", "muted"]).optional(),
  })
  .strict()
  .superRefine((inline, context) => {
    if (inline.type === "text" && inline.value === undefined)
      context.addIssue({ code: "custom", message: "Text value is required" });
    if (
      inline.type === "text" &&
      (inline.path !== undefined ||
        inline.format !== undefined ||
        inline.currency !== undefined)
    )
      context.addIssue({
        code: "custom",
        message: "Text inlines cannot define binding properties",
      });
    if (inline.type === "binding" && !inline.path)
      context.addIssue({ code: "custom", message: "Binding path is required" });
    if (inline.type === "binding" && inline.value !== undefined)
      context.addIssue({
        code: "custom",
        message: "Binding inlines cannot define a text value",
      });
    if (inline.currency && inline.format !== "money")
      context.addIssue({
        code: "custom",
        message: "Inline currency requires money formatting",
      });
  });
export type TemplateInline = z.infer<typeof TemplateInlineSchema>;

export type TemplateNode = Readonly<{
  type:
    | "page"
    | "section"
    | "stack"
    | "grid"
    | "heading"
    | "paragraph"
    | "richText"
    | "image"
    | "list"
    | "table"
    | "repeat"
    | "condition"
    | "component"
    | "toc"
    | "pageBreak"
    | "spacer"
    | "divider";
  master?: string | undefined;
  id?: string | undefined;
  level?: number | undefined;
  content?: readonly TemplateInline[] | undefined;
  children?: readonly TemplateNode[] | undefined;
  source?: string | undefined;
  as?: string | undefined;
  component?: string | undefined;
  props?: Readonly<Record<string, TemplateValue>> | undefined;
  condition?: TemplateCondition | undefined;
  columns?: number | undefined;
  gapMm?: number | undefined;
  fit?: "contain" | "cover" | undefined;
  altPath?: string | undefined;
  caption?: readonly TemplateInline[] | undefined;
  ordered?: boolean | undefined;
  itemsPath?: string | undefined;
  tableColumns?:
    | readonly Readonly<{
        header: string;
        path: string;
        format?: "text" | "date" | "number" | "money" | undefined;
        currency?: string | undefined;
        align?: "left" | "center" | "right" | undefined;
      }>[]
    | undefined;
  tocDepth?: number | undefined;
  heightMm?: number | undefined;
}>;

const nodeProperties: Readonly<
  Record<TemplateNode["type"], ReadonlySet<string>>
> = {
  page: new Set(["type", "master", "children"]),
  section: new Set(["type", "id", "children"]),
  stack: new Set(["type", "children", "gapMm"]),
  grid: new Set(["type", "children", "columns", "gapMm"]),
  heading: new Set(["type", "id", "level", "content"]),
  paragraph: new Set(["type", "content"]),
  richText: new Set(["type", "source"]),
  image: new Set(["type", "source", "fit", "altPath", "caption", "heightMm"]),
  list: new Set(["type", "source", "itemsPath", "ordered"]),
  table: new Set(["type", "source", "tableColumns"]),
  repeat: new Set(["type", "source", "as", "children"]),
  condition: new Set(["type", "condition", "children"]),
  component: new Set(["type", "component", "props"]),
  toc: new Set(["type", "tocDepth"]),
  pageBreak: new Set(["type"]),
  spacer: new Set(["type", "heightMm"]),
  divider: new Set(["type"]),
};

export const TemplateNodeSchema: z.ZodType<TemplateNode> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        "page",
        "section",
        "stack",
        "grid",
        "heading",
        "paragraph",
        "richText",
        "image",
        "list",
        "table",
        "repeat",
        "condition",
        "component",
        "toc",
        "pageBreak",
        "spacer",
        "divider",
      ]),
      master: TemplateIdentifierSchema.optional(),
      id: z
        .string()
        .regex(/^[a-z][a-z0-9-]{0,63}$/)
        .optional(),
      level: z.number().int().min(1).max(6).optional(),
      content: z.array(TemplateInlineSchema).max(200).optional(),
      children: z.array(TemplateNodeSchema).max(500).optional(),
      source: z.string().min(1).max(256).optional(),
      as: z
        .string()
        .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
        .optional(),
      component: TemplateIdentifierSchema.optional(),
      props: z.record(TemplateIdentifierSchema, TemplateValueSchema).optional(),
      condition: TemplateConditionSchema.optional(),
      columns: z.number().int().min(1).max(12).optional(),
      gapMm: z.number().min(0).max(40).optional(),
      fit: z.enum(["contain", "cover"]).optional(),
      altPath: TemplatePathSchema.optional(),
      caption: z.array(TemplateInlineSchema).max(100).optional(),
      ordered: z.boolean().optional(),
      itemsPath: TemplatePathSchema.optional(),
      tableColumns: z
        .array(
          z
            .object({
              header: z.string().max(200),
              path: TemplatePathSchema,
              format: z.enum(["text", "date", "number", "money"]).optional(),
              currency: z
                .string()
                .regex(/^[A-Z]{3}$/)
                .optional(),
              align: z.enum(["left", "center", "right"]).optional(),
            })
            .strict(),
        )
        .max(30)
        .optional(),
      tocDepth: z.number().int().min(1).max(6).optional(),
      heightMm: z.number().min(0).max(297).optional(),
    })
    .strict()
    .superRefine((node, context) => {
      for (const key of Object.keys(node))
        if (!nodeProperties[node.type].has(key))
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is not valid for ${node.type} nodes`,
          });
      const requireChildren = [
        "page",
        "section",
        "stack",
        "grid",
        "repeat",
        "condition",
      ].includes(node.type);
      if (requireChildren && !node.children?.length)
        context.addIssue({
          code: "custom",
          path: ["children"],
          message: `${node.type} nodes require children`,
        });
      if (
        (node.type === "heading" || node.type === "paragraph") &&
        !node.content?.length
      )
        context.addIssue({
          code: "custom",
          path: ["content"],
          message: `${node.type} nodes require content`,
        });
      if (
        ["richText", "image", "table", "repeat"].includes(node.type) &&
        !node.source
      )
        context.addIssue({
          code: "custom",
          path: ["source"],
          message: `${node.type} nodes require a source`,
        });
      if (
        node.source &&
        !TemplatePathSchema.safeParse(node.source).success &&
        !(node.type === "image" && UuidSchema.safeParse(node.source).success)
      )
        context.addIssue({
          code: "custom",
          path: ["source"],
          message: "Source must be a field path or a fixed image UUID",
        });
      if (node.type === "list" && !node.source && !node.itemsPath)
        context.addIssue({
          code: "custom",
          path: ["itemsPath"],
          message: "list nodes require a source or itemsPath",
        });
      if (node.type === "list" && node.source && node.itemsPath)
        context.addIssue({
          code: "custom",
          path: ["itemsPath"],
          message: "list nodes cannot define both source and itemsPath",
        });
      if (node.type === "table" && !node.tableColumns?.length)
        context.addIssue({
          code: "custom",
          path: ["tableColumns"],
          message: "table nodes require columns",
        });
      if (node.type === "condition" && !node.condition)
        context.addIssue({
          code: "custom",
          path: ["condition"],
          message: "condition nodes require a condition",
        });
      if (node.type === "component" && !node.component)
        context.addIssue({
          code: "custom",
          path: ["component"],
          message: "component nodes require a component name",
        });
    }),
);

const ColorReferenceSchema = z.union([
  z.enum(["text", "heading", "primary", "accent", "muted"]),
  z.string().regex(/^#[0-9a-fA-F]{6}$/),
]);
export const TemplatePageMasterSchema = z
  .object({
    background: ColorReferenceSchema.optional(),
    color: ColorReferenceSchema.optional(),
    marginTopMm: z.number().min(0).max(80).optional(),
    marginRightMm: z.number().min(0).max(80).optional(),
    marginBottomMm: z.number().min(0).max(80).optional(),
    marginLeftMm: z.number().min(0).max(80).optional(),
    hideHeader: z.boolean().optional(),
    hideFooter: z.boolean().optional(),
    startOn: z.enum(["any", "recto", "verso"]).optional(),
    edgeBar: z
      .object({
        color: ColorReferenceSchema,
        widthMm: z.number().min(0.5).max(30),
        side: z.enum(["left", "right", "outside"]),
      })
      .strict()
      .optional(),
  })
  .strict();
export type TemplatePageMaster = z.infer<typeof TemplatePageMasterSchema>;

const TemplateDefinitionShapeSchema = z
  .object({
    schemaVersion: z.literal(1),
    styleVersionId: UuidSchema,
    description: z.string().max(1_000).optional(),
    fields: z.record(TemplateIdentifierSchema, TemplateFieldDefinitionSchema),
    computed: z
      .record(TemplateIdentifierSchema, TemplateExpressionSchema)
      .optional(),
    pageMasters: z.record(TemplateIdentifierSchema, TemplatePageMasterSchema),
    components: z
      .record(TemplateIdentifierSchema, z.array(TemplateNodeSchema).max(500))
      .optional(),
    document: z.array(TemplateNodeSchema).min(1).max(1_000),
  })
  .strict();

const definitionStructureIsSafe = (value: unknown): boolean => {
  const stack: { readonly value: unknown; readonly depth: number }[] = [
    { value, depth: 0 },
  ];
  const seen = new WeakSet<object>();
  let entries = 0;
  while (stack.length) {
    const current = stack.pop()!;
    if (
      current.value === null ||
      typeof current.value !== "object" ||
      current.value instanceof Date
    )
      continue;
    if (seen.has(current.value)) return false;
    seen.add(current.value);
    if (current.depth > 80 || ++entries > 50_000) return false;
    const values = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value);
    for (const child of values)
      stack.push({ value: child, depth: current.depth + 1 });
  }
  return true;
};

const validatedTemplateDefinitionSchema =
  TemplateDefinitionShapeSchema.superRefine((definition, context) => {
    const fields = definition.fields;
    const computed = definition.computed ?? {};
    const components = definition.components ?? {};
    const masters = definition.pageMasters;
    const issue = (path: PropertyKey[], message: string) =>
      context.addIssue({ code: "custom", path, message });

    if (!Object.keys(masters).length)
      issue(["pageMasters"], "At least one page master is required");
    for (const name of Object.keys(computed))
      if (name in fields)
        issue(
          ["computed", name],
          "Computed values cannot shadow declared fields",
        );

    const fieldAt = (
      path: string,
      locals: Readonly<
        Record<string, TemplateFieldDefinition | undefined>
      > = {},
    ): TemplateFieldDefinition | undefined => {
      const parts = path.split(".");
      const first = parts.shift()!;
      let field = first in locals ? locals[first] : fields[first];
      if (!field) return undefined;
      for (const part of parts) {
        if (field.type !== "object" || !field.fields) return undefined;
        field = field.fields[part];
        if (!field) return undefined;
      }
      return field;
    };
    const fieldWithin = (
      field: TemplateFieldDefinition,
      path: string,
    ): TemplateFieldDefinition | undefined => {
      let current = field;
      for (const part of path.split(".")) {
        if (current.type !== "object" || !current.fields) return undefined;
        const next = current.fields[part];
        if (!next) return undefined;
        current = next;
      }
      return current;
    };
    const computedFieldAt = (
      path: string,
      seen = new Set<string>(),
    ): TemplateFieldDefinition | undefined => {
      const [name, ...remaining] = path.split(".");
      if (!name || seen.has(name)) return undefined;
      const expression = computed[name];
      if (!expression) return undefined;
      const nextSeen = new Set([...seen, name]);
      let field: TemplateFieldDefinition | undefined;
      switch (expression.op) {
        case "path":
          field =
            fieldAt(expression.path) ??
            computedFieldAt(expression.path, nextSeen);
          break;
        case "add":
        case "subtract":
        case "multiply":
        case "divide":
        case "sum":
        case "count":
          field = { type: "number", label: name };
          break;
        case "dateAdd":
          field = { type: "date", label: name };
          break;
        case "value":
          field =
            typeof expression.value === "number"
              ? { type: "number", label: name }
              : typeof expression.value === "boolean"
                ? { type: "boolean", label: name }
                : typeof expression.value === "string"
                  ? { type: "text", label: name }
                  : undefined;
          break;
      }
      if (!field || !remaining.length) return field;
      return fieldWithin(field, remaining.join("."));
    };
    const knownPath = (
      path: string,
      locals: Readonly<Record<string, TemplateFieldDefinition | undefined>>,
      allowProps: boolean,
    ) => {
      const first = path.split(".")[0]!;
      if (first === "index") return path === "index";
      if (allowProps && first === "props") return true;
      return Boolean(fieldAt(path, locals) ?? computedFieldAt(path));
    };

    const expressionPaths = (expression: TemplateExpression): string[] => {
      switch (expression.op) {
        case "value":
          return [];
        case "path":
        case "count":
        case "dateAdd":
          return [
            expression.path,
            ...(expression.op === "dateAdd"
              ? expressionPaths(expression.days)
              : []),
          ];
        case "sum":
          return [expression.path];
        case "add":
        case "subtract":
        case "multiply":
        case "divide":
          return [
            ...expressionPaths(expression.left),
            ...expressionPaths(expression.right),
          ];
      }
    };
    const numericExpression = (
      expression: TemplateExpression,
      stack = new Set<string>(),
    ): boolean => {
      switch (expression.op) {
        case "value":
          return typeof expression.value === "number";
        case "path": {
          const root = expression.path.split(".")[0]!;
          const field = fieldAt(expression.path);
          if (field) return ["number", "money"].includes(field.type);
          const dependency = computed[root];
          if (!dependency || stack.has(root)) return false;
          return numericExpression(dependency, new Set([...stack, root]));
        }
        case "add":
        case "subtract":
        case "multiply":
        case "divide":
          return (
            numericExpression(expression.left, stack) &&
            numericExpression(expression.right, stack)
          );
        case "sum": {
          const source = fieldAt(expression.path);
          if (source?.type !== "list" || !source.item) return false;
          const item = expression.valuePath
            ? fieldWithin(source.item, expression.valuePath)
            : source.item;
          return Boolean(item && ["number", "money"].includes(item.type));
        }
        case "count":
          return fieldAt(expression.path)?.type === "list";
        case "dateAdd":
          return false;
      }
    };
    const computedGraph = new Map<string, string[]>();
    for (const [name, expression] of Object.entries(computed)) {
      const paths = expressionPaths(expression);
      for (const path of paths)
        if (!knownPath(path, {}, false))
          issue(["computed", name], `Unknown expression path: ${path}`);
      computedGraph.set(
        name,
        paths
          .map((path) => path.split(".")[0]!)
          .filter((root) => root in computed),
      );
      if (
        ["add", "subtract", "multiply", "divide"].includes(expression.op) &&
        !numericExpression(expression, new Set([name]))
      )
        issue(
          ["computed", name],
          "Arithmetic expressions require numeric operands",
        );
      if (
        expression.op === "dateAdd" &&
        !numericExpression(expression.days, new Set([name]))
      )
        issue(["computed", name, "days"], "dateAdd days must be numeric");
      if (expression.op === "sum" && !numericExpression(expression))
        issue(["computed", name], "sum requires numeric list values");
      if (expression.op === "sum" || expression.op === "count") {
        const source = fieldAt(expression.path);
        if (source && source.type !== "list")
          issue(["computed", name], `${expression.op} requires a list path`);
        if (
          expression.op === "sum" &&
          expression.valuePath &&
          source?.type === "list" &&
          source.item
        ) {
          const valueField = fieldWithin(source.item, expression.valuePath);
          if (!valueField || !["number", "money"].includes(valueField.type))
            issue(
              ["computed", name, "valuePath"],
              "sum valuePath must resolve to a numeric list-item field",
            );
        }
      }
      if (expression.op === "dateAdd") {
        const source = fieldAt(expression.path);
        if (source && source.type !== "date")
          issue(["computed", name], "dateAdd requires a date path");
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visitComputed = (name: string): boolean => {
      if (visiting.has(name)) return false;
      if (visited.has(name)) return true;
      visiting.add(name);
      for (const dependency of computedGraph.get(name) ?? [])
        if (!visitComputed(dependency)) return false;
      visiting.delete(name);
      visited.add(name);
      return true;
    };
    for (const name of computedGraph.keys())
      if (!visitComputed(name)) {
        issue(["computed", name], "Computed expressions cannot be cyclic");
        visiting.clear();
      }

    const headingIds = new Set<string>();
    const componentGraph = new Map<string, Set<string>>();
    for (const name of Object.keys(components))
      componentGraph.set(name, new Set());

    const inspectInlines = (
      values: readonly TemplateInline[] | undefined,
      path: PropertyKey[],
      locals: Readonly<Record<string, TemplateFieldDefinition | undefined>>,
      allowProps: boolean,
    ) => {
      for (const [index, inline] of (values ?? []).entries()) {
        if (inline.type !== "binding" || !inline.path) continue;
        if (!knownPath(inline.path, locals, allowProps)) {
          issue(
            [...path, index, "path"],
            `Unknown binding path: ${inline.path}`,
          );
          continue;
        }
        const field =
          fieldAt(inline.path, locals) ?? computedFieldAt(inline.path);
        if (inline.format === "date" && field && field.type !== "date")
          issue([...path, index, "format"], "Date formatting requires a date");
        if (
          (inline.format === "number" || inline.format === "money") &&
          field &&
          !["number", "money"].includes(field.type)
        )
          issue(
            [...path, index, "format"],
            "Numeric formatting requires a number or money value",
          );
      }
    };

    const inspectNodes = (
      nodes: readonly TemplateNode[],
      path: PropertyKey[],
      locals: Readonly<Record<string, TemplateFieldDefinition | undefined>>,
      componentOwner?: string,
    ) => {
      const allowProps = componentOwner !== undefined;
      for (const [index, node] of nodes.entries()) {
        const nodePath = [...path, index];
        if (node.type === "page") {
          const master = node.master ?? Object.keys(masters)[0];
          if (!master || !(master in masters))
            issue([...nodePath, "master"], "Unknown page master");
        }
        if (node.type === "component" && node.component) {
          if (!(node.component in components))
            issue([...nodePath, "component"], "Unknown component");
          else if (componentOwner)
            componentGraph.get(componentOwner)?.add(node.component);
        }
        if (node.type === "heading" && node.id) {
          if (componentOwner)
            issue(
              [...nodePath, "id"],
              "Component headings use generated instance-safe IDs",
            );
          if (headingIds.has(node.id))
            issue([...nodePath, "id"], "Heading IDs must be unique");
          headingIds.add(node.id);
        }
        inspectInlines(
          node.content,
          [...nodePath, "content"],
          locals,
          allowProps,
        );
        inspectInlines(
          node.caption,
          [...nodePath, "caption"],
          locals,
          allowProps,
        );
        const source = node.itemsPath ?? node.source;
        if (
          source &&
          !(node.type === "image" && UuidSchema.safeParse(source).success) &&
          !knownPath(source, locals, allowProps)
        )
          issue([...nodePath, "source"], `Unknown source path: ${source}`);
        if (node.altPath && !knownPath(node.altPath, locals, allowProps))
          issue([...nodePath, "altPath"], `Unknown alt path: ${node.altPath}`);
        if (
          node.condition &&
          !knownPath(node.condition.path, locals, allowProps)
        )
          issue(
            [...nodePath, "condition", "path"],
            `Unknown condition path: ${node.condition.path}`,
          );
        if (node.condition) {
          const conditionField =
            fieldAt(node.condition.path, locals) ??
            computedFieldAt(node.condition.path);
          if (
            !["truthy", "falsy"].includes(node.condition.operator) &&
            node.condition.value === undefined
          )
            issue(
              [...nodePath, "condition", "value"],
              `${node.condition.operator} requires a comparison value`,
            );
          if (
            ["gt", "gte", "lt", "lte"].includes(node.condition.operator) &&
            conditionField &&
            !["number", "money"].includes(conditionField.type)
          )
            issue(
              [...nodePath, "condition", "operator"],
              "Ordered comparisons require numeric data",
            );
          if (
            node.condition.operator === "contains" &&
            conditionField &&
            !["text", "richText", "list"].includes(conditionField.type)
          )
            issue(
              [...nodePath, "condition", "operator"],
              "contains requires text or list data",
            );
        }
        const sourceField = source
          ? (fieldAt(source, locals) ?? computedFieldAt(source))
          : undefined;
        if (
          ["repeat", "list", "table"].includes(node.type) &&
          sourceField &&
          sourceField.type !== "list"
        )
          issue([...nodePath, "source"], `${node.type} requires a list field`);
        if (
          node.type === "richText" &&
          sourceField &&
          !["richText", "text"].includes(sourceField.type)
        )
          issue(
            [...nodePath, "source"],
            "richText requires a text or rich-text field",
          );
        if (
          node.type === "image" &&
          sourceField &&
          sourceField.type !== "image"
        )
          issue([...nodePath, "source"], "image requires an image field");
        if (
          node.type === "table" &&
          sourceField?.type === "list" &&
          sourceField.item
        )
          for (const [columnIndex, column] of (
            node.tableColumns ?? []
          ).entries())
            if (!fieldWithin(sourceField.item, column.path))
              issue(
                [...nodePath, "tableColumns", columnIndex, "path"],
                `Unknown table column path: ${column.path}`,
              );
        const childLocals =
          node.type === "repeat" && node.as
            ? { ...locals, [node.as]: sourceField?.item }
            : locals;
        if (node.children)
          inspectNodes(
            node.children,
            [...nodePath, "children"],
            childLocals,
            componentOwner,
          );
      }
    };

    inspectNodes(definition.document, ["document"], {});
    for (const [name, nodes] of Object.entries(components))
      inspectNodes(nodes, ["components", name], {}, name);

    const componentVisiting = new Set<string>();
    const componentVisited = new Set<string>();
    const visitComponent = (name: string): boolean => {
      if (componentVisiting.has(name)) return false;
      if (componentVisited.has(name)) return true;
      componentVisiting.add(name);
      for (const dependency of componentGraph.get(name) ?? [])
        if (!visitComponent(dependency)) return false;
      componentVisiting.delete(name);
      componentVisited.add(name);
      return true;
    };
    for (const name of componentGraph.keys())
      if (!visitComponent(name)) {
        issue(["components", name], "Components cannot be cyclic");
        componentVisiting.clear();
      }
  });

export const TemplateDefinitionSchema = z.preprocess(
  (value) => (definitionStructureIsSafe(value) ? value : undefined),
  validatedTemplateDefinitionSchema.refine(
    (value) => byteLength(value) <= TEMPLATE_DEFINITION_MAX_BYTES,
    { message: "Template definition exceeds 512 KiB UTF-8" },
  ),
);
export type TemplateDefinition = z.infer<typeof TemplateDefinitionSchema>;

export const CreateTemplateInputSchema = z
  .object({
    companyId: UuidSchema,
    name: z.string().trim().min(1).max(120),
    definition: TemplateDefinitionSchema,
  })
  .strict();
export const CreateTemplateVersionInputSchema = z
  .object({
    definition: TemplateDefinitionSchema,
    activate: z.boolean().default(true),
  })
  .strict();

export const TemplateSchema = z
  .object({
    id: UuidSchema,
    companyId: UuidSchema,
    name: z.string().min(1).max(120),
    activeVersionId: UuidSchema.nullable(),
    archivedAt: TimestampSchema.nullable(),
    createdAt: TimestampSchema,
  })
  .strict();
export const TemplateVersionSchema = z
  .object({
    id: UuidSchema,
    templateId: UuidSchema,
    version: z.number().int().positive(),
    definition: TemplateDefinitionSchema,
    createdByUserId: z.string(),
    createdAt: TimestampSchema,
  })
  .strict();

export const CreateTemplateDocumentInputSchema = z
  .object({
    companyId: UuidSchema,
    templateId: UuidSchema,
    title: z.string().trim().min(1).max(200),
    data: TemplateDataSchema,
    metadata: z.record(z.string().max(64), z.string().max(512)).optional(),
  })
  .strict();
export const UpdateTemplateDocumentInputSchema = z
  .object({
    templateVersionId: UuidSchema.optional(),
    data: TemplateDataSchema,
  })
  .strict();
export const RenderTemplatePreviewInputSchema = z
  .object({
    definition: TemplateDefinitionSchema.optional(),
    versionId: UuidSchema.optional(),
    data: TemplateDataSchema,
  })
  .strict()
  .refine((value) => Boolean(value.definition || value.versionId), {
    message: "A template definition or version is required",
  });

export type Template = z.infer<typeof TemplateSchema>;
export type TemplateVersion = z.infer<typeof TemplateVersionSchema>;
export type TemplateData = z.infer<typeof TemplateDataSchema>;
export type CreateTemplateInput = z.infer<typeof CreateTemplateInputSchema>;
export type CreateTemplateDocumentInput = z.infer<
  typeof CreateTemplateDocumentInputSchema
>;
