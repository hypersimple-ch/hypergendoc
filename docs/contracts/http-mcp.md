# HTTP and MCP contract

Shared Zod schemas in `packages/contracts` are authoritative. JSON uses `camelCase`, IDs are UUIDs, timestamps are RFC 3339 UTC, and writes reject unknown fields.

## Errors and authorization

Errors use `{ "error": { "code", "message", "requestId", "details?" } }`. Stable codes include `unauthenticated`, `forbidden`, `not_found`, `conflict`, `validation_failed`, `rate_limited`, `render_rejected`, `render_failed`, `dependency_unavailable`, and `internal_error`.

All `/api` routes require a secure human session except registration, verification, reset, and health. Cross-workspace/company targets are masked as `not_found`; the same applies to inaccessible document history, revert, and PDF access.

## Document HTTP surface

- `POST /api/documents`
- `POST /api/documents/:documentId/source`
- `GET /api/documents/:documentId`
- `GET /api/documents/:documentId/commits`
- `GET /api/documents/:documentId/commits/:commitSha`
- `GET /api/documents/:documentId/commits/:commitSha/source`
- `POST /api/documents/:documentId/revert`
- `GET /api/documents/:documentId/pdf` (current source only)

A commit SHA is lowercase 40- or 64-character hexadecimal. Invalid or path-like SHAs are not found. The historical source route is a private `text/plain; charset=utf-8` attachment named `.md` or `.html`; it has `Cache-Control: private, no-store`. Revert takes `{ commitSha }` and creates a new commit rather than changing history. PDF rendering is explicit and in memory; there is no historical PDF route, stored document artifact, or numeric version route.

Mutation routes use CSRF protection where cookie authentication is accepted. Uploads and bodies have explicit limits.

## MCP

MCP is stateless Streamable HTTP at `/mcp` over HTTPS and requires `Authorization: Bearer <token>`. The credential produces an `AgentActor`; handlers use the same authorization services as HTTP.

- `list_companies({ cursor?, limit? })` — `companies:read`
- `list_styles({ companyId, cursor?, limit? })` — `styles:read`
- `list_documents({ companyId, cursor?, limit? })` — `documents:read`
- `get_document({ documentId })` — `documents:read`
- `create_document({ companyId, styleId, title, format, body, metadata? })` — `documents:write`
- `update_document({ documentId, format, body, styleVersionId? })` — `documents:write`
- `list_document_commits({ documentId, cursor?, limit? })` — `documents:read`
- `read_document_commit({ documentId, commitSha })` — `documents:read`
- `revert_document({ documentId, commitSha })` — `documents:write`

Pagination cursors are opaque references to the last item returned. An unknown, deleted, or stale cursor fails with `validation_failed`; it never restarts pagination at the first page.

Numeric-version tools do not exist.

## Input and limits

`format` is exactly `"markdown"` or `"html"`; it is never inferred. HTML is a sanitized fragment. Inputs are capped at 256 KiB, PDFs at 25 MiB, rendering at 30 seconds and 100 pages, and pagination defaults to 50 with a maximum of 100.

Additive response changes require optional fields; breaking changes require a versioned route or tool contract.

## Template HTTP surface

- `GET|POST /api/companies/:companyId/templates`
- `GET /api/templates/:templateId`
- `GET|POST /api/templates/:templateId/versions`
- `POST /api/templates/:templateId/activate`
- `POST /api/templates/:templateId/preview`
- `POST /api/documents/from-template`
- `POST /api/documents/:documentId/data`
- `POST /api/companies/:companyId/assets/images`
- `GET /api/companies/:companyId/assets/images/:objectId/content`

Company archive/restore is an explicit lifecycle. Style and template responses do not expose archive state because archive/restore commands for those resources are not part of the current contract.

The complete field, path, expression, node, page-master, and failure contract is documented in [Declarative template contract](./template-ast.md).

Template definitions are strict, versioned declarative ASTs. They pin a style version and may define typed fields, computed expressions, page masters, components, conditions, repeaters, tables, image bindings, contents navigation, and generic layout nodes. Document data and definitions retain the existing explicit byte, expansion, renderer, and tenant-isolation limits. Unknown fields, arbitrary HTML/CSS/JavaScript, remote assets, invalid expressions, and foreign-company media references are rejected.

Additional MCP tools are `list_templates`, `get_template`, `create_document_from_template`, and `update_template_document`. Reading template definitions requires `templates:read`; template-backed document writes require `documents:write`. Template authoring and activation remain human-session operations.
