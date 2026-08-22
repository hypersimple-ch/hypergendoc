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

PostgreSQL stores document index and authorization metadata, not source bodies, generated HTML, PDFs, or render records. Object storage is limited to uploaded logo, font, and validated template-media bytes; it never stores document source, generated HTML, or PDFs.

Creating or updating a document appends a Git commit. History reads use commit SHAs. Revert reads the selected commit and appends a new commit. Company archival retains its repository; purge is out of scope.

PDFs are generated only when the current-PDF endpoint is requested. The renderer receives resolved source and returns PDF bytes in memory; no PDF is retained. Historical commits expose source only.

## Authorization and resilience

Workspaces own companies, documents, styles, memberships, credentials, and audit records. Human sessions and MCP credentials establish the workspace; MCP permissions also require action scope and company allow-list membership. Cross-workspace/company document, commit, revert, and PDF requests are masked as `not_found`.

Company archive and restore are explicit product operations. Style and template versions are immutable, but style/template archive state is not part of the public lifecycle contract. The reserved database columns and single-replica rate-limit boundary are governed by [ADR 0001](./decisions/0001-lifecycle-and-scaling-boundaries.md).

The renderer has no network, database, object-store, or application secrets. It runs non-root with a read-only filesystem, narrow capabilities, `no-new-privileges`, seccomp, bounded resources, and per-job cleanup.

## Operations

The private Git volume is durable deployment state. Back up Git and PostgreSQL consistently, encrypt backups before off-VPS transfer, and restore both together in drills. Object-store backup remains necessary for uploaded logos, fonts, and template media. Garage is single-node with no redundancy; encrypted backups and tested restores are mandatory.

See the [HTTP/MCP contract](../contracts/http-mcp.md), [data policy](../operations/data-policy.md), and [operations runbook](../operations/runbook.md).

## Declarative template runtime

The runtime is business-kind agnostic while user-authored templates may be fully business-specific. `template_versions` store a strict schema-versioned AST and pin a `style_version`. The generic runtime understands typed fields, bindings, safe expression trees, repeat/condition expansion, page masters, layout primitives, tables, images, TOC nodes and pagination; it has no built-in proposal, invoice, legal, financial, medical, or other business-domain vocabulary.

Template document Git source is canonical `documents/<uuid>/document.json` containing the pinned template-version ID and validated data. Renderer requests remain structured: the isolated worker independently compiles the same template, data, style, verified fonts/logo and verified media into deterministic standalone HTML, blocks all network access, computes the source hash, and emits a bounded PDF. Historical reads and reverts resolve the exact immutable versions from commit metadata rather than active pointers.
