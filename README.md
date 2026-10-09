# HyperGenDoc

A narrow TypeScript MVP for agencies that produce branded PDF artifacts for client companies. It provides workspace-scoped owner/member access, immutable styles, Git-backed document history, private object storage for uploaded logos, fonts, and template media, and company-scoped/revocable MCP credentials. It is **not production-ready**, a legal service, a financial workflow, a client portal, an arbitrary document-runtime host, or a dashboard document editor.

## Local development

Prerequisites: Node.js 22+, pnpm 11.11.0, and Docker Compose. From a clean checkout:

```sh
pnpm install
cp .env.example .env
docker compose up --build
```

The development entry point is `http://localhost:8080`. Compose runs Caddy, the Next.js web app, Node server, migration job, PostgreSQL, Garage private S3-compatible storage, and the Unix-socket renderer. Only Caddy publishes a normal host port. The checked-in `.env.example` values are development-only; do not use them outside local development.

For app processes without Compose, `pnpm dev` starts only the web, server, and renderer workspaces. The web development server at `http://localhost:3000` forwards `/api/*` to `http://127.0.0.1:4000`; set `SERVER_INTERNAL_ORIGIN` in the web process environment to use another API address. Production routing remains the deployment proxy's responsibility.

The server development command loads root `.env`, then optional root `.env.local` overrides; explicitly exported environment variables take precedence. Use Node.js 22.9+ for optional environment-file support. For host-run development against the project's Compose PostgreSQL database:

```sh
docker compose -f compose.yaml -f compose.host.yaml up -d postgres
```

This optional override requires Docker Compose 2.24.4+ and publishes PostgreSQL only on `127.0.0.1:15432`, preserving the existing database volume. It puts PostgreSQL on a separate host-development network; use it for the host-run API, not the full containerized stack. Configure the ignored root `.env.local` with:

```dotenv
APP_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://hypergendoc:dev-only-change-me@127.0.0.1:15432/hypergendoc
DOCUMENT_GIT_ROOT=/absolute/path/to/your/checkout/.local/git
```

Match the database credentials to `.env`. `APP_ORIGIN` must match the browser origin or mutations will be rejected. Garage S3-compatible storage and the renderer socket must also be reachable for uploads and PDF rendering; the Compose-only service addresses in `.env.example` are not host addresses. Apply migrations explicitly with the same host configuration:

```sh
pnpm --filter @hypergendoc/db exec node --env-file=../../.env --env-file-if-exists=../../.env.local --import tsx src/migrate.ts
```

## Architecture and environment

- Local browser and MCP traffic enters through Caddy. Production uses Dokploy's Traefik for HTTPS and path routing; Caddy is not part of the production stack.
- PostgreSQL holds identity, tenant/document index and authorization metadata, credential hashes, and audit records. One private Git repository per company holds document source history; private Garage S3-compatible storage holds uploaded logos, fonts, and validated template media only. The renderer receives jobs only over a Unix socket, has no network, and renders current PDFs in memory. Style definitions live in PostgreSQL; only uploaded logo, font, and validated template-media bytes live in Garage, under opaque `private/` keys. Compose persists Garage metadata and bytes in the `object-metadata` and `object-data` named volumes (mounted at `/var/lib/garage/meta` and `/var/lib/garage/data` inside the object-store container).
- Required server configuration is `APP_ORIGIN`, `BETTER_AUTH_SECRET`, `CREDENTIAL_PEPPER`, `DATABASE_URL`, `S3_REGION`, `S3_BUCKET`, and S3 credentials. Garage requires `GARAGE_RPC_SECRET`; `S3_ENDPOINT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `RENDERER_SOCKET`, `RENDER_TIMEOUT_MS`, `NODE_ENV`, and `LOG_LEVEL` are also documented in [`.env.example`](.env.example). The internal Garage endpoint is `http://object-store:3900` in region `garage`; production requires SMTP and HTTPS for external S3 endpoints, while only the isolated Compose service name `object-store` may use internal HTTP.
- Production Garage is a single-node `replication_factor=1` deployment. It has no storage redundancy: encrypted off-VPS backups and restore drills are mandatory. A future HA deployment requires three nodes across three zones with replication factor 3.

Production deploys the standalone [`compose.prod.yaml`](compose.prod.yaml) through Dokploy with no published application ports. Configure the same HTTPS hostname in Dokploy for `/api`, `/mcp`, and `/health` to `server:4000`, then `/` to `web:3000`, without stripping paths. See the [operations runbook](docs/operations/runbook.md) for the exact route settings.

See the authoritative [MVP architecture](docs/architecture/mvp.md), [HTTP/MCP contract](docs/contracts/http-mcp.md), and [data policy](docs/operations/data-policy.md).

## Migrations, tests, and fixtures

```sh
pnpm db:migrations:check
pnpm compose:check
pnpm test:run
pnpm test:regression
pnpm check
```

`pnpm check` runs formatting, linting, type checks, unit/component/service/route/repository tests, focused security regressions, and builds. `pnpm test` runs workspace test watchers. Full browser and real-stack E2E suites are inactive under [`archive/e2e`](archive/e2e). There is no seed-data command; shared test fixture helpers live in `packages/test-support`.

## Contributing

Keep changes scoped, add or update tests for behavior changes, and run the relevant checks above. Validate migrations with `pnpm db:migrations:check` and Compose policy with `pnpm compose:check` when touching those areas. Contract schemas in `packages/contracts` and the architecture/contract documents are authoritative. Do not broaden the accepted document-input formats or claim security/compliance/production guarantees without corresponding implementation and release evidence.

## Guides and runbooks

- [Agency guide](docs/user/agency-guide.md)
- [MCP client guide](docs/mcp/client-guide.md)
- [Operations runbook](docs/operations/runbook.md)
- [Security runbook](docs/security/runbook.md)

## Templates and document authoring

HyperGenDoc includes a business-kind-agnostic [declarative template runtime](docs/contracts/template-ast.md). Workspace users create company-specific, immutable template versions that pin an immutable style version. A template may encode any business document through typed fields, page masters, generic layout nodes, reusable components, conditions, repeaters, formulas, tables, images, and automatic contents navigation. HyperGenDoc core does not contain proposal, invoice, contract, or other business-specific concepts.

Template-backed document data is validated against the pinned template version and stored as canonical JSON in the same private company Git history used by Markdown and HTML source. Company media remains private, is resolved by UUID only, and is embedded into the isolated renderer after ownership and hash verification. The dashboard supports template creation/version activation, exact PDF previews, template-driven document creation, typed revision editing, history, revert, and PDF download. Templates never accept arbitrary CSS, JavaScript, remote URLs, or unsanitized HTML.
