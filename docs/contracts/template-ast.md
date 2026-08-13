# Declarative template contract

HyperGenDoc templates are business-kind agnostic. A template author assigns the business meaning through fields and fixed text; the runtime only understands typed data, safe expressions, layout, pagination, and owned media. Every saved version is immutable and pins one immutable `styleVersionId`.

## Identifiers and paths

Field, computed-value, component, page-master, repeater-alias, and component-property identifiers must start with an ASCII letter and then contain only letters, digits, `_`, or `-` (maximum 64 characters). A path is one or more of these identifiers joined with `.`. Paths must resolve at save time to a declared field, computed value, active repeater alias, `index`, or component `props`. Unknown references, cycles, duplicate heading IDs, and field/computed name collisions are rejected.

Template definitions are limited to 512 KiB, template data to 256 KiB, and data lists to 500 entries. Definitions receive an iterative depth/resource check before recursive schema parsing; rendering independently enforces expansion, depth, output, page-count, and timeout limits.

## Fields

| Type                       | Runtime value            | Type-specific options                                  |
| -------------------------- | ------------------------ | ------------------------------------------------------ |
| `text`, `richText`, `date` | string                   | `text` may define string `options`                     |
| `number`, `money`          | finite number            | `money` may define an ISO-4217 `currency`              |
| `boolean`                  | boolean                  | —                                                      |
| `image`                    | company-owned image UUID | PNG, JPEG, or WebP only                                |
| `object`                   | closed object            | requires `fields`; undeclared nested keys are rejected |
| `list`                     | array                    | requires one typed `item` definition                   |

All fields require `label`. `required`, `description`, and a type-correct `default` are optional. Defaults are validated recursively when the template version is saved. Rich text is sanitized by the trusted runtime. Images never accept remote URLs or data URIs.

## Expressions and conditions

Computed expressions support literal `value`, `path`, numeric `add`/`subtract`/`multiply`/`divide`, list `sum`, list `count`, and `dateAdd`. Arithmetic operands must be numeric, `sum` must target numeric list values, `count` must target a list, and `dateAdd` must target a date with numeric days. Expression dependencies must be acyclic.

A condition contains `path`, an operator (`truthy`, `falsy`, `equals`, `notEquals`, `contains`, `gt`, `gte`, `lt`, or `lte`), and an optional comparison `value`.

## AST nodes

Every node is strict: properties not listed for its node type are rejected.

| Node                   | Required                                | Optional                                |
| ---------------------- | --------------------------------------- | --------------------------------------- |
| `page`                 | non-empty `children`                    | `master` (defaults to the first master) |
| `section`              | non-empty `children`                    | `id`                                    |
| `stack`                | non-empty `children`                    | `gapMm`                                 |
| `grid`                 | non-empty `children`                    | `columns`, `gapMm`                      |
| `heading`              | non-empty inline `content`              | `id`, `level`                           |
| `paragraph`            | non-empty inline `content`              | —                                       |
| `richText`             | text/rich-text `source` path            | —                                       |
| `image`                | image `source` path or owned-image UUID | `fit`, `altPath`, inline `caption`      |
| `list`                 | list `source` or `itemsPath`            | `ordered`                               |
| `table`                | list `source`, non-empty `tableColumns` | column format/currency/alignment        |
| `repeat`               | list `source`, non-empty `children`     | `as` alias                              |
| `condition`            | `condition`, non-empty `children`       | —                                       |
| `component`            | declared `component` name               | literal `props`                         |
| `toc`                  | —                                       | `tocDepth`                              |
| `pageBreak`, `divider` | —                                       | —                                       |
| `spacer`               | —                                       | `heightMm`                              |

Inline content is either `{ "type": "text", "value": "..." }` or `{ "type": "binding", "path": "..." }`; bindings may specify display `format`, `currency`, emphasis, weight, and a style color token.

## Page masters and pagination

At least one page master is required. A master may override style margins, background/text color, running-header/footer visibility, recto/verso start behavior, and an inside/outside edge bar. Named `@page` rules remain renderer-owned; identifier restrictions prevent CSS injection. Logical page nodes establish page boundaries, content flows onto additional physical pages, explicit `pageBreak` nodes are honored, and the renderer fills TOC page numbers from measured physical flow. PDF output uses tagged-PDF and outline generation.

## Minimal example

```json
{
  "schemaVersion": 1,
  "styleVersionId": "00000000-0000-4000-8000-000000000001",
  "fields": {
    "title": { "type": "text", "label": "Title", "required": true },
    "body": { "type": "richText", "label": "Body", "required": true }
  },
  "pageMasters": { "standard": {} },
  "document": [
    {
      "type": "page",
      "master": "standard",
      "children": [
        {
          "type": "heading",
          "level": 1,
          "content": [{ "type": "binding", "path": "title" }]
        },
        { "type": "richText", "source": "body" }
      ]
    }
  ]
}
```

The authoring dashboard validates JSON syntax locally, sends definitions through the authoritative contract validator before saving, offers typed sample-data forms and private-image upload, and previews with the same isolated renderer used for documents. A successful edit creates a new immutable version; activation changes only the template's active-version pointer.
