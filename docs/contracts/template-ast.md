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

At render time `sum` contributes `0` for missing or non-numeric list values and arithmetic on non-numeric operands yields an empty value rather than failing the render. `count` returns the number of entries of its target list at runtime; if the resolved value is not a list it renders as `0` (the schema still requires the path to declare a list at save time). `dateAdd` returns an ISO `YYYY-MM-DD` date, or an empty value for unparseable inputs.

### Component properties

Inside a component body, bindings and conditions may reference `props.<identifier>`. Props are literal typed values only — they accept no expressions or nested paths beyond the property name. Validation deliberately does not restrict which property names may be referenced; a missing prop simply renders as an empty value, so components degrade gracefully instead of failing the document. Bindings to anything other than declared fields, computed values, active repeater aliases, `index`, or `props.*` are rejected.

A condition contains `path`, an operator (`truthy`, `falsy`, `equals`, `notEquals`, `contains`, `gt`, `gte`, `lt`, or `lte`), and an optional comparison `value`.

## AST nodes

Every node is strict: properties not listed for its node type are rejected.

| Node                   | Required                                | Optional                                                   |
| ---------------------- | --------------------------------------- | ---------------------------------------------------------- |
| `page`                 | non-empty `children`                    | `master` (defaults to the first master)                    |
| `section`              | non-empty `children`                    | `id`                                                       |
| `stack`                | non-empty `children`                    | `gapMm`                                                    |
| `grid`                 | non-empty `children`                    | `columns`, `gapMm`                                         |
| `heading`              | non-empty inline `content`              | `id`, `level`                                              |
| `paragraph`            | non-empty inline `content`              | —                                                          |
| `richText`             | text/rich-text `source` path            | —                                                          |
| `image`                | image `source` path or owned-image UUID | `fit`, `altPath`, inline `caption`, `heightMm`             |
| `list`                 | list `source` or `itemsPath`            | `ordered`                                                  |
| `table`                | list `source`, non-empty `tableColumns` | column format/currency/alignment, `footerRow`, `zebraRows` |
| `repeat`               | list `source`, non-empty `children`     | `as` alias                                                 |
| `condition`            | `condition`, non-empty `children`       | —                                                          |
| `component`            | declared `component` name               | literal `props`                                            |
| `toc`                  | —                                       | `tocDepth`                                                 |
| `pageBreak`, `divider` | —                                       | —                                                          |
| `spacer`               | —                                       | `heightMm`                                                 |

Inline content is either `{ "type": "text", "value": "..." }` or `{ "type": "binding", "path": "..." }`; bindings may specify display `format`, `currency`, emphasis, weight, and a style color token.

### Headings

Optional heading `id` values must be lowercase identifiers (`^[a-z][a-z0-9-]{0,63}$`), must be unique across the whole definition, and are forbidden inside components; component headings always use renderer-generated instance-safe IDs so repeated components cannot collide. Omitted IDs are generated as stable `heading-N` references used by the TOC.

### Tables

Table columns bind to fields of the list item and may declare display `format`, `currency`, and `align`. An optional `footerRow` is an array of cells aligned to `tableColumns`; each cell is either empty (`{}`) or a single `{ "path": ... }` binding resolved against the enclosing template scope (declared fields, computed values, active repeater aliases — never the row scope), such as a computed sum. Footer cells reuse the aligned column's `format`, `currency`, and alignment, and render as a visually distinct footer row. The optional boolean `zebraRows` stripes even body rows with the style's muted color token.

### Page-master watermarks

A page master may declare an optional `watermark`: `{ text (1–64 characters), tone ("neutral" | "warning" | "danger"), opacity ("subtle" | "normal" | "strong") }`. Tones map to fixed renderer-owned colors and opacity presets to fixed values; free-form colors and images are not accepted. The watermark renders centered at a fixed −30° rotation behind content on every physical page flowed from pages using that master.

## Starter templates

The server ships a small, server-owned starter catalog (`GET /api/starter-templates`) of complete, valid definitions with sample data. `POST /api/templates/from-starter` instantiates one for a company by pinning a caller-chosen `styleVersionId` into the copied definition and saving it as an INACTIVE first version; nothing is activated automatically. Duplicating a template (`POST /api/templates/:templateId/duplicate`) copies the latest version definition under a `(copy)` name, also as an inactive first version. In both cases every saved version remains immutable: adjusting a starter or a copy means creating and activating a new version in the studio.

## Locale-aware formatting

Template definitions may declare an optional root-level BCP-47 `locale` tag (validated with `Intl.Locale`; invalid tags are rejected). When absent, `"en"` is used. The stored locale drives all rendered number, money, and date formatting for bindings, list items, and table cells, and also sets the HTML `lang` attribute and the header/footer `{date}` token format. Rendering stays deterministic for a given definition, data, and locale.

## Headers, footers, and page numbers

When a style header or footer is enabled and `showPageNumber` is set, the page counter is appended in the **right box of both the header and the footer** (as CSS `counter(page)`); no other margin box receives a page number. Header/footer text additionally supports the tokens `{page}` and `{pages}`, which expand to `counter(page)` and `counter(pages)`; `{title}`, which resolves to the document title; and `{date}`, which renders the render date formatted with the active locale (a stable ISO-like `YYYY-MM-DD` format when the locale is `"en"`). Unknown braces stay literal text. All expanded text is CSS-string-escaped before emission, so tokens cannot inject CSS.

## Page masters and pagination

At least one page master is required. A master may override style margins, background/text color, running-header/footer visibility, recto/verso start behavior, an inside/outside edge bar, and a watermark. Named `@page` rules remain renderer-owned; identifier restrictions prevent CSS injection. Logical page nodes establish page boundaries, content flows onto additional physical pages, explicit `pageBreak` nodes are honored, and the renderer fills TOC page numbers from measured physical flow. PDF output uses tagged-PDF and outline generation.

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
