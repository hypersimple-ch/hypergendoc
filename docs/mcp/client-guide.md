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

| Tool                                                              | Required action   |
| ----------------------------------------------------------------- | ----------------- |
| ----------------------------------------------------------------- | ----------------- |
| `list_companies({ cursor?, limit? })`                             | `companies:read`  |
| `list_styles({ companyId, cursor?, limit? })`                     | `styles:read`     |
| `list_documents({ companyId, cursor?, limit? })`                  | `documents:read`  |
| `get_document({ documentId })`                                    | `documents:read`  |
| `get_document_version({ documentId, version })`                   | `documents:read`  |
| `create_document({ companyId, styleId, title, body, metadata? })` | `documents:write` |
| `create_document_version({ documentId, body, styleVersionId? })`  | `documents:write` |

Use IDs returned by list tools. `metadata` is optional, has at most 32 string fields, keys up to 64 characters, and values up to 512 characters. Write inputs reject unknown fields.

## Curated body subset

This is a parser, not arbitrary TeX. Plain text must escape TeX metacharacters (`\{`, `\}`, `\%`, `\#`, `\$`, `\&`, `\_`); supported inline commands are `\textbf{}`, `\emph{}`, and `\href{https://…}{}` or `\href{mailto:name@example.com}{}`. Supported blocks are paragraphs, `\section{}`, `\subsection{}`, `\newpage`, `itemize`, `enumerate`, `quote`, and `tabular` with `l`, `c`, or `r` columns.

```tex
\section{Proposal}
Hello \textbf{Client}. See \href{https://example.com}{the brief}.

\begin{itemize}
\item Discovery
\item Delivery
\end{itemize}

\begin{tabular}{lc}
Phase & Weeks\\
Discovery & 2
\end{tabular}
```

Preambles, `\documentclass`, packages, macro definitions, file/pipe/shell commands, arbitrary environments, comments, and unsupported commands are rejected. The server owns document class, packages, layout, and style implementation.

## Version behavior, errors, and limits

`create_document` resolves the active exact style version. `create_document_version` inherits its prior exact style version if `styleVersionId` is omitted; supplying it selects another active version only when authorized. Every successful revision remains immutable; rendering failures never replace the current ready version. A returned `downloadUrl` points to the authenticated artifact proxy: send the same MCP Bearer credential when fetching it. It is not a public object URL, and revocation removes access immediately.

Expect safe error codes: `unauthenticated`, `forbidden`, `not_found`, `conflict`, `validation_failed`, `rate_limited`, `render_rejected`, `render_failed`, `dependency_unavailable`, and `internal_error`. Cross-tenant targets intentionally return `not_found`. Preserve the returned request ID when contacting an operator; errors omit source, token, and compiler details.

Requests are limited to 256 KiB; pagination defaults to 50 and caps at 100; MCP credentials are rate-limited (currently 60 requests per 60 seconds). A rate-limited HTTP response includes `Retry-After`. Render input/output limits also apply: 256 KiB body, 25 MiB PDF, and 30 seconds wall clock. See the authoritative [HTTP/MCP contract](../contracts/http-mcp.md).
