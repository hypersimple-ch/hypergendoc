# Release test suites

These suites are bounded and opt-in where they mutate a running stack.

```sh
pnpm test:release-assets
RUN_INTEGRATION_SECURITY=1 E2E_ORIGIN=https://docs.example.com \
  E2E_DATABASE_URL='<operator test database URL>' pnpm test:release-assets
RUN_PRODUCTION_COMPOSE_TESTS=1 PRODUCTION_ENV_FILE=deploy/prod/secrets.env \
  pnpm test:release-assets
RUN_BOUNDED_LOAD=1 PRODUCTION_ENV_FILE=deploy/prod/secrets.env \
  E2E_ORIGIN=https://docs.example.com E2E_DATABASE_URL='<operator test database URL>' \
  pnpm test:release-assets
```

Run production-Compose suites only against disposable release-test data. Because production relies on external Dokploy ingress, a VPS-equivalent drill may set `PRODUCTION_COMPOSE_OVERRIDE` to a test-only Compose file that publishes server and dependency ports on loopback; never add those ports to `compose.prod.yaml`. The renderer suite restarts the renderer. The load suite stops and restarts PostgreSQL and object storage, then restarts the server; it never removes volumes.

The real-stack flow covers bounded generic authentication, fresh session identifiers, token hashing and restart-persistent revocation, authenticated private artifact proxying, tenant isolation, polyglot rejection, concurrent versions, limits, and audit attribution. Production-Compose suites additionally inspect redacted logs, renderer cgroups/socket/network boundaries, page/output exhaustion, hostile input, cleanup, and dependency restart recovery.
