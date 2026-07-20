# HTTP and MCP contract

Shared Zod schemas in `packages/contracts` are authoritative. JSON field names use `camelCase`; identifiers are opaque UUID strings; timestamps are RFC 3339 UTC strings. Unknown fields are rejected on writes.

## Error envelope

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The request is invalid.",
    "requestId": "opaque-id",
    "details": [{ "path": "body.title", "code": "too_big" }]
  }
}
```

Stable codes: `unauthenticated`, `forbidden`, `not_found`, `conflict`, `validation_failed`, `rate_limited`, `render_rejected`, `render_failed`, `dependency_unavailable`, and `internal_error`. Cross-tenant targets use `not_found`. Internal errors and render logs are never exposed.

## HTTP surface

All `/api` routes require a secure human session except registration/verification/reset and health endpoints.

- `POST /api/workspaces`, `GET /api/workspaces/current`
- `GET/POST /api/workspaces/current/members`; owner-only mutation routes
- `GET/POST /api/companies`; `GET/PATCH/DELETE /api/companies/:companyId`
- `POST /api/companies/:companyId/logo`
- `GET/POST /api/companies/:companyId/styles`
- `GET /api/styles/:styleId`; `POST /api/styles/:styleId/versions`; `POST /api/styles/:styleId/activate`
- `POST /api/styles/:styleId/preview`
- `GET/POST /api/mcp-credentials`; `PATCH/DELETE /api/mcp-credentials/:credentialId` (owner only)
- `GET/POST /api/documents`; `GET /api/documents/:documentId`
- `POST /api/documents/:documentId/versions`; `GET /api/documents/:documentId/versions/:version`
- `GET /api/documents/:documentId/versions/:version/input` downloads the exact immutable submitted body. It responds with `text/plain; charset=utf-8`, `Cache-Control: private, no-store`, and an attachment filename ending in `.md` for Markdown or `.html` for HTML.
- `GET /api/documents/:documentId/versions/:version/pdf` is the authorized private PDF download route; `?disposition=inline` is supported only for this PDF route.
- owner-only audit and deletion routes

There is no document-render-evidence download route. The input route is the only document-body download surface. Mutation routes use CSRF protection where cookie authentication is accepted. Uploads use explicit content/size limits.

## MCP transport

Expose stateless standard MCP Streamable HTTP at `/mcp` over HTTPS. Require `Authorization: Bearer <token>`. Authentication builds an `AgentActor`; tool handlers call the same domain services as HTTP routes.

### Tools

- `list_companies({ cursor?, limit? })` — requires `companies:read`.
- `list_styles({ companyId, cursor?, limit? })` — requires `styles:read` and company scope.
- `list_documents({ companyId, cursor?, limit? })` — requires `documents:read` and company scope.
- `get_document({ documentId })` — requires `documents:read` and target company scope.
- `get_document_version({ documentId, version })` — same read checks; returns version metadata and an authorized private PDF download reference.
- `create_document({ companyId, styleId, title, format, body, metadata? })` — requires `documents:write`; `format` is required and is exactly `"markdown"` or `"html"`; resolves the active exact style version.
- `create_document_version({ documentId, format, body, styleVersionId? })` — requires `documents:write`; `format` is required and is exactly `"markdown"` or `"html"`; inherits the prior exact style version when omitted.

Every immutable version records the original exact submitted `body` and required `format`; format is never inferred. The identity hash covers both values. Tool output includes structured content and a concise text representation. No style mutation tool exists in the MVP.

## Input formats

Markdown is submitted as plain UTF-8 text. HTML is submitted as a fragment, not a complete document: its sanitized semantic fragment is rendered, while the exact submitted HTML remains the immutable input. Empty sanitized input is rejected. The service does not accept a user CSS or style layer.

The sanitizer conservatively permits semantic headings, paragraphs, emphasis, lists, blockquotes, code/preformatted blocks, links restricted to safe protocols, and tables. It removes scripts, styles, event handlers, forms, iframes, objects, embeds, SVG, images, arbitrary attributes/classes/IDs, inline CSS, protocol-relative URLs, file/local/unsafe URLs, and external resources.

## Limits

- Body: 256 KiB UTF-8 after request decoding.
- Logo upload: 10 MiB and validated image allow-list.
- Rendered PDF: 25 MiB.
- Render wall clock: 30 seconds.
- Rendered document: 100 pages.
- Pagination: default 50, maximum 100.

## Compatibility

Contract schemas carry an API version. Additive response changes require optional fields; breaking changes require a versioned route/tool contract. Schema tests must decode documented examples and reject malformed, oversized, unknown-field, missing-format, and cross-entity identifier shapes.
