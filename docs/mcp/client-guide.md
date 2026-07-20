# MCP client guide

## Connect safely

HyperGenDoc exposes stateless Streamable HTTP MCP at `https://<service-origin>/mcp`. Send `Authorization: Bearer <token>` over HTTPS. The credential supplies the workspace and company boundary; never send a workspace ID or store the token in source control or logs.

## Tools and scopes

| Tool                                                                              | Required action   |
| --------------------------------------------------------------------------------- | ----------------- |
| `list_companies`                                                                  | `companies:read`  |
| `list_styles`                                                                     | `styles:read`     |
| `list_documents`, `get_document`, `list_document_commits`, `read_document_commit` | `documents:read`  |
| `create_document`, `update_document`, `revert_document`                           | `documents:write` |

Use IDs returned by list tools. Every request must also target an allow-listed company. Cross-company/workspace targets return `not_found`.

## Source history

`create_document` and `update_document` require `format` (`"markdown"` or `"html"`) and `body`. They append Git commits; source history is addressed by the lowercase 40- or 64-character hexadecimal `commitSha`. `read_document_commit` reads a historical source snapshot. `revert_document` takes `{ documentId, commitSha }` and appends a new commit.

There are no numeric-version tools. PDFs are not MCP artifacts: the authenticated HTTP PDF endpoint renders only the current source in memory. Historical commits expose source, not PDFs.

HTML input is a sanitized fragment. Do not submit user-authored CSS, style markup, scripts, external resources, or unsafe URLs.

Requests are limited to 256 KiB; pagination defaults to 50 and caps at 100. Safe errors omit document bodies, tokens, and renderer details. See the [HTTP/MCP contract](../contracts/http-mcp.md).
