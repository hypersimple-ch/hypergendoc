# Version-pinned bases; production should additionally pin these tags to registry digests.
FROM node:22.23.1-bookworm-slim AS build
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/renderer ./apps/renderer
RUN corepack enable \
  && pnpm install --frozen-lockfile \
  && pnpm --filter @hypergendoc/renderer build \
  && pnpm exec esbuild apps/renderer/src/index.ts \
    --bundle --platform=node --format=esm --target=node22 --outfile=/out/index.js

FROM debian:bookworm-slim AS tectonic
ARG TECTONIC_VERSION=0.15.0
ARG TECTONIC_SHA256=875fbbc9ab48560d7776088c608e0beee49197b57ab4a2f6c5385b2c661c842f
RUN apt-get update && apt-get install --no-install-recommends -y \
    ca-certificates curl fontconfig fonts-dejavu-core libgraphite2-3 libssl3 libstdc++6 libzstd1 zlib1g \
  && curl --fail --location --retry 3 \
    "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-gnu.tar.gz" \
    --output /tmp/tectonic.tar.gz \
  && echo "${TECTONIC_SHA256}  /tmp/tectonic.tar.gz" | sha256sum --check --strict \
  && tar --extract --gzip --file /tmp/tectonic.tar.gz --directory /usr/local/bin tectonic \
  && rm -rf /tmp/tectonic.tar.gz /var/lib/apt/lists/*

# Fetch only the packages used by the server-owned template during the build.
FROM tectonic AS tectonic-cache
ENV TECTONIC_CACHE_DIR=/opt/tectonic-cache
COPY apps/renderer/tectonic-cache-warmup.tex /tmp/tectonic-cache-warmup.tex
RUN mkdir -p /opt/tectonic-cache /tmp/out \
  && tectonic -X compile --outdir /tmp/out /tmp/tectonic-cache-warmup.tex \
  && touch /opt/tectonic-cache/.hypergendoc-bundle-ready

FROM node:22.23.1-bookworm-slim
# The template maps every contract font to these documented system fonts.
RUN apt-get update && apt-get install --no-install-recommends -y \
    fontconfig fonts-dejavu-core libgraphite2-3 libssl3 libzstd1 zlib1g \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10001 renderer \
  && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin renderer \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=tectonic /usr/local/bin/tectonic /usr/local/bin/tectonic
COPY --from=tectonic-cache /opt/tectonic-cache /opt/tectonic-cache
COPY --from=build /out/index.js /app/index.js
ENV NODE_ENV=production RENDERER_TEX_BINARY=/usr/local/bin/tectonic RENDERER_TECTONIC_CACHE_DIR=/opt/tectonic-cache RENDERER_SOCKET=/run/hypergendoc/renderer.sock
WORKDIR /app
USER renderer:renderer
ENTRYPOINT ["node", "index.js"]
