#!/usr/bin/env bash
set -euo pipefail

image="hypergendoc-server-smoke-$$"
container="${image}-container"
network="${image}-network"
postgres="${image}-postgres"
migration_image="${image}-migration-image"
migration="${image}-migration"
database_url="postgresql://smoke:smoke@${postgres}:5432/smoke"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    for resource in "$container" "$postgres" "$migration"; do
      if docker container inspect "$resource" >/dev/null 2>&1; then
        echo "Server smoke test failed; ${resource} logs:" >&2
        docker logs "$resource" >&2 || true
      fi
    done
  fi
  docker rm --force --volumes "$container" "$postgres" "$migration" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm --force "$image" "$migration_image" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

docker build --target runtime --file deploy/prod/Dockerfile.server --tag "$image" .
docker build --target migration --file deploy/prod/Dockerfile.server --tag "$migration_image" .
docker network create "$network" >/dev/null
docker run --detach --name "$postgres" --network "$network" \
  --env POSTGRES_USER=smoke \
  --env POSTGRES_PASSWORD=smoke \
  --env POSTGRES_DB=smoke \
  --tmpfs /var/lib/postgresql/data \
  postgres:16-alpine >/dev/null

postgres_ready=false
for _ in $(seq 1 30); do
  if docker exec "$postgres" pg_isready -U smoke -d smoke; then
    postgres_ready=true
    break
  fi
  sleep 1
done
if [ "$postgres_ready" != true ]; then
  echo "Smoke PostgreSQL did not become ready within 30 seconds." >&2
  exit 1
fi

docker run --name "$migration" --network "$network" \
  --env DATABASE_URL="$database_url" "$migration_image"
rows=$(docker exec "$postgres" psql -U smoke -d smoke -v ON_ERROR_STOP=1 -At \
  -c 'SELECT count(*) FROM mutation_operations;')
if [ "$rows" != "0" ]; then
  echo "Smoke migrations did not produce an empty mutation_operations table." >&2
  exit 1
fi
echo "Smoke migrations passed; mutation_operations contains zero rows."

docker run --detach --name "$container" --network "$network" \
  --env NODE_ENV=test \
  --env APP_ORIGIN=http://127.0.0.1:4000 \
  --env BETTER_AUTH_SECRET=smoke-test-secret-not-for-production \
  --env CREDENTIAL_PEPPER=smoke-test-pepper-not-for-production \
  --env DATABASE_URL="$database_url" \
  --env S3_REGION=us-east-1 \
  --env S3_BUCKET=smoke-bucket \
  --env S3_ACCESS_KEY=smoke-access-key \
  --env S3_SECRET_KEY=smoke-secret-key \
  --env DOCUMENT_GIT_ROOT=/tmp/hypergendoc-git \
  "$image" >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$container" node -e \
    'fetch("http://127.0.0.1:4000/health/live", { signal: AbortSignal.timeout(2000) }).then(response => process.exit(response.status === 200 ? 0 : 1)).catch(() => process.exit(1))'; then
    echo "Server runtime image passed liveness smoke test."
    exit 0
  fi
  sleep 1
done

echo "Server runtime image did not become live within 30 seconds." >&2
exit 1
