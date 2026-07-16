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
- `GET /api/documents`; `GET /api/documents/:documentId`
- `GET /api/documents/:documentId/versions/:version`
- authorized source/PDF download routes
- owner-only audit and deletion routes

Mutation routes use CSRF protection where cookie authentication is accepted. Uploads use explicit content/size limits.

## MCP transport

Expose stateless standard MCP Streamable HTTP at `/mcp` over HTTPS. Require `Authorization: Bearer <token>`. Authentication builds an `AgentActor`; tool handlers call the same domain services as HTTP routes.

### Tools

- `list_companies({ cursor?, limit? })` — requires `companies:read`.
- `list_styles({ companyId, cursor?, limit? })` — requires `styles:read` and company scope.
- `list_documents({ companyId, cursor?, limit? })` — requires `documents:read` and company scope.
- `get_document({ documentId })` — requires `documents:read` and target company scope.
- `get_document_version({ documentId, version })` — same read checks; returns metadata, body/source according to contract, and an authorized download reference.
- `create_document({ companyId, styleId, title, body, metadata? })` — requires `documents:write`; resolves the active exact style version.
- `create_document_version({ documentId, body, styleVersionId? })` — requires `documents:write`; inherits prior exact style version when omitted.

Tool output includes structured content and a concise text representation. No style mutation tool exists in the MVP.

## Limits

- Body: 256 KiB UTF-8 after request decoding.
- Logo upload: 10 MiB and validated image allow-list.
- Rendered artifact: 25 MiB.
- Render wall clock: 30 seconds.
- Pagination: default 50, maximum 100.
- Additional parser node/depth/table/page, session, request, and key rate limits are configurable but cannot be disabled in production.

## Compatibility

Contract schemas carry an API version. Additive response changes require optional fields; breaking changes require a versioned route/tool contract. Schema tests must decode documented examples and reject malformed, oversized, unknown-field, and cross-entity identifier shapes.
