# HyperGenDoc MVP architecture

HyperGenDoc is a multi-tenant service for agencies that manage branded documents for client companies. Humans use the dashboard; agents use scoped MCP credentials. It is not a general document host, browser editor, or legal workflow product.

## Runtime and boundaries

Browser and MCP traffic enter through Traefik, then the web or server service. The server uses PostgreSQL, private object storage, a durable private Git volume, and an isolated renderer over a Unix socket. Only Traefik is public. PostgreSQL, object storage, Git repositories, renderer IPC, and service internals are private.

- `apps/web` — dashboard and API client.
- `apps/server` — HTTP, MCP, authorization, domain services, and audit.
- `apps/renderer` — pinned Playwright renderer.
- `packages/contracts` — shared Zod contracts.
- `packages/db` — PostgreSQL index and authorization metadata.

Transport adapters call authoritative domain services. Repositories always receive a trusted workspace ID.

## Git-backed document history

Git is the document source-history authority. Each company has one private isomorphic-git repository; a document snapshot is stored only at `documents/<document-uuid>/document.md` or `document.html`. Repositories are never directly accessible.

PostgreSQL stores document index and authorization metadata, not source bodies, generated HTML, PDFs, or render records. Object storage is limited to logos and styles; it never stores document source, generated HTML, or PDFs.

Creating or updating a document appends a Git commit. History reads use commit SHAs. Revert reads the selected commit and appends a new commit. Company archival retains its repository; purge is out of scope.

PDFs are generated only when the current-PDF endpoint is requested. The renderer receives resolved source and returns PDF bytes in memory; no PDF is retained. Historical commits expose source only.

## Authorization and resilience

Workspaces own companies, documents, styles, memberships, credentials, and audit records. Human sessions and MCP credentials establish the workspace; MCP permissions also require action scope and company allow-list membership. Cross-workspace/company document, commit, revert, and PDF requests are masked as `not_found`.

The renderer has no network, database, object-store, or application secrets. It runs non-root with a read-only filesystem, narrow capabilities, `no-new-privileges`, seccomp, bounded resources, and per-job cleanup.

## Operations

The private Git volume is durable deployment state. Back up Git and PostgreSQL consistently, encrypt backups before off-VPS transfer, and restore both together in drills. Object-store backup remains necessary for logos/styles. Garage is single-node with no redundancy; encrypted backups and tested restores are mandatory.

See the [HTTP/MCP contract](../contracts/http-mcp.md), [data policy](../operations/data-policy.md), and [operations runbook](../operations/runbook.md).
