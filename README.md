# HyperGenDoc

A narrow TypeScript MVP for agencies that produce branded PDF artifacts for client companies. It provides workspace-scoped owner/member access, immutable styles and document versions, private object storage, and company-scoped/revocable MCP credentials. It is **not production-ready**, a legal service, a financial workflow, a client portal, an arbitrary-LaTeX host, or a dashboard document editor.

## Local development

Prerequisites: Node.js 22+, pnpm 11.11.0, and Docker Compose. From a clean checkout:

```sh
pnpm install
cp .env.example .env
docker compose up --build
```

The development entry point is `http://localhost:8080`. Compose runs Caddy, the Next.js web app, Node server, migration job, PostgreSQL, Garage private S3-compatible storage, and the Unix-socket renderer. Only Caddy publishes a normal host port. The checked-in `.env.example` values are development-only; do not use them outside local development.

For app processes without Compose, `pnpm dev` starts only the web, server, and renderer workspaces; PostgreSQL and Garage S3-compatible storage must already be reachable using `.env` values. Apply migrations explicitly with:

```sh
pnpm --filter @hypergendoc/db migrate
```

## Architecture and environment

- Local browser and MCP traffic enters through Caddy. Production uses Dokploy's Traefik for HTTPS and path routing; Caddy is not part of the production stack.
- PostgreSQL holds identity, tenant metadata, versions, credential hashes, and audit records. Private Garage S3-compatible storage holds logos and PDF/source artifacts. The renderer receives jobs only over a Unix socket and has no network.
- Required server configuration is `APP_ORIGIN`, `BETTER_AUTH_SECRET`, `CREDENTIAL_PEPPER`, `DATABASE_URL`, `S3_REGION`, `S3_BUCKET`, and S3 credentials. Garage requires `GARAGE_RPC_SECRET`; `S3_ENDPOINT`, `SMTP_URL`, `MAIL_FROM`, `RENDERER_SOCKET`, `RENDER_TIMEOUT_MS`, `NODE_ENV`, and `LOG_LEVEL` are also documented in [`.env.example`](.env.example). The internal Garage endpoint is `http://object-store:3900` in region `garage`; production requires SMTP and HTTPS for external S3 endpoints, while only the isolated Compose service name `object-store` may use internal HTTP.
- Production Garage is a single-node `replication_factor=1` deployment. It has no storage redundancy: encrypted off-VPS backups and restore drills are mandatory. A future HA deployment requires three nodes across three zones with replication factor 3.

Production deploys the standalone [`compose.prod.yaml`](compose.prod.yaml) through Dokploy with no published application ports. Configure the same HTTPS hostname in Dokploy for `/api`, `/mcp`, `/mcp-artifacts`, and `/health` to `server:4000`, then `/` to `web:3000`, without stripping paths. See the [operations runbook](docs/operations/runbook.md) for the exact route settings.

See the authoritative [MVP architecture](docs/architecture/mvp.md), [HTTP/MCP contract](docs/contracts/http-mcp.md), and [data policy](docs/operations/data-policy.md).

## Migrations, tests, and fixtures

```sh
pnpm db:migrations:check
pnpm compose:check
pnpm test:run
pnpm test:release-assets
pnpm check
```

`pnpm check` runs formatting verification, linting, type checks, workspace and release-asset tests, and builds. `pnpm test` runs workspace test watchers. Release suites and their opt-in variables are documented in [`tests/README.md`](tests/README.md). There is no seed-data command; shared test fixture helpers live in `packages/test-support` and integration tests require their documented opt-in environment variables.

To run the full HTTP/MCP flow against the test-only Compose overlay:

```sh
docker compose -f compose.yaml -f compose.e2e.yaml up --build
E2E_DATABASE_URL=postgresql://hypergendoc:dev-only-change-me@localhost:15432/hypergendoc pnpm e2e:flow
```

The overlay exposes dependencies on loopback and substitutes a fake renderer; it is not a deployment configuration. `pnpm e2e:renderer` expects access to the configured renderer Unix socket.

## Contributing

Keep changes scoped, add or update tests for behavior changes, and run the relevant checks above. Validate migrations with `pnpm db:migrations:check` and Compose policy with `pnpm compose:check` when touching those areas. Contract schemas in `packages/contracts` and the architecture/contract documents are authoritative. Do not broaden the accepted LaTeX language or claim security/compliance/production guarantees without corresponding implementation and release evidence.

## Guides and runbooks

- [Agency guide](docs/user/agency-guide.md)
- [MCP client guide](docs/mcp/client-guide.md)
- [Operations runbook](docs/operations/runbook.md)
- [Security runbook](docs/security/runbook.md)
