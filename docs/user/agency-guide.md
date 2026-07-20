# Agency guide

## Roles and companies

The first user creates a workspace as its owner. Owners and members can create, read, and update companies; create style versions; activate styles; and review document versions, submitted inputs, and PDFs. Only owners manage memberships and MCP credentials or archive a company. A workspace must retain an owner. Workspace selection comes from the authenticated membership, not a submitted ID; another workspace's ID is reported as not found.

Create each client as a company, then upload its logo (validated image type; maximum 10 MiB) and create a structured style. Logos and artifacts are private storage objects, not public links.

## Versioned styles and documents

A style edit creates a new immutable style version. Activating a version changes what a _new_ document selects; it never changes existing document versions. Deactivating a style prevents new selection but preserves history.

Creating a document records pending version 1 with the original exact body and an explicit `format` of `"markdown"` or `"html"`, validates it, resolves the active exact style version, and renders it. Format is never inferred. A successful render marks the version ready and advances the document's current pointer. A failed render does not advance that pointer. Review the ready PDF, original input, and version metadata in the dashboard before relying on an artifact.

Each revision is a new immutable, monotonic document version. It inherits the preceding version's exact style version unless an authorized caller explicitly selects another active style version. Versions are not overwritten. The input identity hash includes both the exact body and format.

HTML is an input fragment format, not an HTML document or styling surface. Its sanitized semantic fragment is rendered, while the original exact submitted HTML is retained as the immutable input. Empty sanitized input is rejected. Structured server-owned style fields generate all CSS, page layout, headers, footers, and page numbering; users do not supply CSS or style markup. See the [MCP client guide](../mcp/client-guide.md) for the sanitizer allow-list and input examples.

## MCP credentials

Owners issue a credential with a company allow-list and only the required actions. The plaintext token appears once: place it directly in the approved MCP client's secret store, not chat, tickets, repositories, or logs. Owners can revoke it; revocation is checked by the next request. See the [MCP client guide](../mcp/client-guide.md).

## Deletion and backups

The current owner flow can archive a company; it does not expose a complete self-service workspace/customer purge. A destructive purge is a reviewed operator procedure and remains a release limitation until the application purge job is implemented and tested. The approved replacement deployment cleanup may purge pre-replacement document history and render metadata after review. SQL removes database metadata only; it cannot remove old Garage object bytes. Operators must separately identify and delete those stale object bytes during deployment cleanup. Purged live data can remain in encrypted backups until their finite retention expires. Do not treat archival or normal versioning as full deletion.

The MVP policy calls for encrypted off-VPS daily backups and periodic restore drills, operated by the service operator. Guarded scripts are supplied, but scheduling, key custody, and restore evidence are operational responsibilities—not a self-service backup or recovery guarantee. See the [data policy](../operations/data-policy.md).

## Important limits and boundaries

- Body input: 256 KiB UTF-8; rendered PDF: 25 MiB; render wall clock: 30 seconds; rendered document: 100 pages.
- Pagination defaults to 50 and has a maximum of 100.
- Documents are artifacts, including proposals and contract-like documents. HyperGenDoc provides no legal validation, legal advice, e-signature, financial workflow, or compliance certification.
- Agents cannot mutate styles. User-authored CSS/style markup and dashboard content editing are outside this MVP.

For permissions, see the authoritative [permission matrix](../security/permission-matrix.md); for supported service behavior, see the [HTTP/MCP contract](../contracts/http-mcp.md).
