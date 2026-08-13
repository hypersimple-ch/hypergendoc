# Agency guide

## Roles and companies

The first user is the workspace owner. Owners and members manage companies, styles, and documents; only owners manage memberships, MCP credentials, and company archival. Workspace access comes from the authenticated membership. Other-workspace IDs appear as not found.

Create a client company, upload its validated logo, and configure a structured style. Logos are private objects, not public links.

## Documents and history

Creating or updating a document writes exact Markdown or the canonical sanitized HTML fragment to the company's private Git history. Each change has a commit SHA; history is immutable. Revert selects an older commit and creates a new commit, rather than overwriting it.

The dashboard can read current or historical source. PDF is available only for the current document and is generated on demand; historical commits do not have PDF previews or downloads. Document source, generated HTML, and PDFs are not retained in object storage.

HTML is a sanitized fragment, not a styling surface. `format` is required as `markdown` or `html`; user CSS is not accepted.

## MCP credentials

Owners issue credentials with the minimum company allow-list and actions. The token appears once; put it in the approved MCP client's secret store. Revocation applies on the next request.

## Archival and backups

Archiving a company retains its private Git history. Purge is not currently provided; neither archival nor normal history is deletion. The service operator performs encrypted off-VPS backups and restore drills. A usable restore requires PostgreSQL and the private Git volume from the same consistent recovery set. See the [data policy](../operations/data-policy.md).

## Limits

- Source input: 256 KiB UTF-8; PDF: 25 MiB; render time: 30 seconds; document: 100 pages.
- Pagination defaults to 50 and has a maximum of 100.
- HyperGenDoc provides no legal validation, legal advice, e-signature, financial workflow, or compliance certification.

See the [permission matrix](../security/permission-matrix.md) and [HTTP/MCP contract](../contracts/http-mcp.md).

## Template studio

Templates are intentionally allowed to model a specific agency workflow or business document; the HyperGenDoc runtime itself remains business-kind agnostic. Create a template under the active company, select an immutable active style version, then define its typed fields, page masters, components and document AST. Preview with representative data before saving an immutable inactive version or activating it. Existing documents stay pinned to their historical template and style versions.

Create a document from an active template in **Documents → Create document**. The generated form follows the template field schema, including nested objects, lists, dates, money, booleans, rich text, and private images. Editing the form later creates a new Git commit; it never mutates an earlier revision. Images are private company assets and are referenced by opaque UUID rather than public URLs.
