#!/usr/bin/env bash
set -euo pipefail

image="hypergendoc-server-smoke-$$"
container="${image}-container"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ] && docker container inspect "$container" >/dev/null 2>&1; then
    echo "Server smoke test failed; container logs:" >&2
    docker logs "$container" >&2 || true
  fi
  docker rm --force "$container" >/dev/null 2>&1 || true
  docker image rm --force "$image" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

docker build --target runtime --file deploy/prod/Dockerfile.server --tag "$image" .
docker run --detach --name "$container" --publish 4000:4000 \
  --env NODE_ENV=test \
  --env APP_ORIGIN=http://127.0.0.1:4000 \
  --env BETTER_AUTH_SECRET=smoke-test-secret-not-for-production \
  --env CREDENTIAL_PEPPER=smoke-test-pepper-not-for-production \
  --env DATABASE_URL=postgresql://smoke:smoke@127.0.0.1:5432/smoke \
  --env S3_REGION=us-east-1 \
  --env S3_BUCKET=smoke-bucket \
  --env S3_ACCESS_KEY=smoke-access-key \
  --env S3_SECRET_KEY=smoke-secret-key \
  --env DOCUMENT_GIT_ROOT=/tmp/hypergendoc-git \
  "$image" >/dev/null

for _ in $(seq 1 30); do
  if [ "$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 2 http://127.0.0.1:4000/health/live || true)" = "200" ]; then
    echo "Server runtime image passed liveness smoke test."
    exit 0
  fi
  sleep 1
done

echo "Server runtime image did not become live within 30 seconds." >&2
exit 1
