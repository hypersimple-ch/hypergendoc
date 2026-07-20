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
    --bundle --platform=node --format=cjs --target=node22 \
    --external:playwright-core --outfile=/out/index.cjs \
  && mkdir -p /out/node_modules \
  && cp -a node_modules/.pnpm/playwright-core@1.61.0/node_modules/playwright-core /out/node_modules/playwright-core

# This image supplies the Chromium revision matched to playwright-core 1.61.0.
FROM mcr.microsoft.com/playwright:v1.61.0-noble
RUN groupadd --gid 10001 renderer \
  && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin renderer \
  && mkdir -p /home/renderer/.cache /tmp \
  && chown -R renderer:renderer /home/renderer /tmp
COPY --from=build /out/index.cjs /app/index.cjs
COPY --from=build /out/node_modules /app/node_modules
ENV NODE_ENV=production \
    RENDERER_SOCKET=/run/hypergendoc/renderer.sock \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HOME=/home/renderer \
    XDG_CACHE_HOME=/home/renderer/.cache \
    TMPDIR=/tmp
WORKDIR /app
USER renderer:renderer
ENTRYPOINT ["node", "index.cjs"]
