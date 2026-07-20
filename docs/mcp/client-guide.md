# MCP client guide

## Connect safely

HyperGenDoc exposes stateless Streamable HTTP MCP at `https://<service-origin>/mcp`. Configure the client to send `Authorization: Bearer <token>` over HTTPS. Do not configure a session cookie or a workspace ID; the credential supplies the workspace and company boundary.

An owner creates the credential in the dashboard, chooses one or more allowed company IDs and only needed actions, and receives the token once. Put it immediately in the MCP client's secret store. It is not retrievable later and must never be committed or logged. A minimal smoke check, with values supplied at runtime, is:

```sh
MCP_ORIGIN=https://<service-origin> MCP_TOKEN='<one-time-token>' pnpm exec tsx scripts/mcp-test-client.ts
```

This only lists available tools; it does not persist a credential. Revoke a suspected or no-longer-needed credential in the owner dashboard. Revocation takes effect on the next request.

## Scopes and tools

All checks require both an action and company allow-list membership. For example, a credential scoped to company `A` with `companies:read`, `styles:read`, and `documents:write` may list its authorized companies and styles and create documents for `A`; it cannot read documents without `documents:read`, create for company `B`, or edit a style.

| Tool                                                                      | Required action   |
| ------------------------------------------------------------------------- | ----------------- |
| `list_companies({ cursor?, limit? })`                                     | `companies:read`  |
| `list_styles({ companyId, cursor?, limit? })`                             | `styles:read`     |
| `list_documents({ companyId, cursor?, limit? })`                          | `documents:read`  |
| `get_document({ documentId })`                                            | `documents:read`  |
| `get_document_version({ documentId, version })`                           | `documents:read`  |
| `create_document({ companyId, styleId, title, format, body, metadata? })` | `documents:write` |
| `create_document_version({ documentId, format, body, styleVersionId? })`  | `documents:write` |

Use IDs returned by list tools. `metadata` is optional, has at most 32 string fields, keys up to 64 characters, and values up to 512 characters. Write inputs reject unknown fields.

## Immutable input

Every `create_document` and `create_document_version` call must explicitly set `format` to `"markdown"` or `"html"`; the service never infers it. The exact submitted body and format become the immutable version input, and their combination is identity-hashed.

Use Markdown for ordinary documents:

```json
{
  "companyId": "11111111-1111-4111-8111-111111111111",
  "styleId": "22222222-2222-4222-8222-222222222222",
  "title": "Proposal",
  "format": "markdown",
  "body": "# Proposal\n\nHello **Client**.\n\n- Discovery\n- Delivery"
}
```

For an HTML version, submit an HTML fragment rather than a full document. The service sanitizes the fragment before rendering; its semantic content may render, but the original exact submitted HTML remains the version input. Empty sanitized input is rejected.

```json
{
  "documentId": "33333333-3333-4333-8333-333333333333",
  "format": "html",
  "body": "<h1>Proposal</h1><p>Hello <strong>Client</strong>.</p>"
}
```

The conservative allow-list retains semantic headings, paragraphs, emphasis, lists, blockquotes, code/preformatted blocks, links using safe protocols, and tables. It removes scripts, styles, event handlers, forms, iframes, objects, embeds, SVG, images, arbitrary attributes/classes/IDs, inline CSS, protocol-relative/file/local/unsafe URLs, and external resources. Do not depend on removed markup or attributes.

Structured server-owned style fields generate all CSS, page layout, headers, footers, and page numbering. Do not submit user-authored CSS or style markup.

## Version behavior, errors, and limits

`create_document` resolves the active exact style version. `create_document_version` inherits its prior exact style version if `styleVersionId` is omitted; supplying it selects another active version only when authorized. Every successful revision remains immutable; rendering failures never replace the current ready version. A returned `downloadUrl` points to the authenticated private PDF proxy: send the same MCP Bearer credential when fetching it. It is not a public object URL, and revocation removes access immediately.

To retrieve the submitted input, use the authenticated HTTP input route described in the [HTTP/MCP contract](../contracts/http-mcp.md); it is not an MCP artifact URL. The internal, deterministic, fully styled HTML is private render evidence (`text/html`), never the submitted-input download, and is not a client download surface.

Expect safe error codes: `unauthenticated`, `forbidden`, `not_found`, `conflict`, `validation_failed`, `rate_limited`, `render_rejected`, `render_failed`, `dependency_unavailable`, and `internal_error`. Cross-tenant targets intentionally return `not_found`. Preserve the returned request ID when contacting an operator; errors omit input bodies, tokens, and renderer details.

Requests are limited to 256 KiB; pagination defaults to 50 and caps at 100; MCP credentials are rate-limited (currently 60 requests per 60 seconds). A rate-limited HTTP response includes `Retry-After`. Render limits also apply: 25 MiB PDF, 30 seconds wall clock, and 100 pages. See the authoritative [HTTP/MCP contract](../contracts/http-mcp.md).
