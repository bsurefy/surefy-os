# SPDX-License-Identifier: AGPL-3.0-only
# SurefyOS API image: the API server, the worker, the migration step and the operator CLI.
# One image, four commands (set per service): node dist/server.js, dist/worker.js, dist/migrate.js,
# dist/cli.js. Build context: the repository root.
#   docker build -f infra/docker/api.Dockerfile .

FROM node:24.21.0-trixie-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /repo
COPY . .
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @surefy/api...
RUN pnpm --filter @surefy/api build
# Production dependencies only; the @surefy/* packages are bundled into dist.
RUN --mount=type=cache,target=/pnpm/store \
    pnpm --filter @surefy/api deploy --prod /out

FROM node:24.21.0-trixie-slim
RUN useradd --system --uid 10001 --no-create-home surefy
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
ENV NODE_ENV=production
USER surefy
EXPOSE 4000
CMD ["node", "dist/server.js"]
