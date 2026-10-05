# SPDX-License-Identifier: AGPL-3.0-only
# SurefyOS workspace web app image (Next.js standalone output). Build context: the repository root.
#   docker build -f infra/docker/workspace.Dockerfile .
# Configuration is read at run time (INTERNAL_API_URL); nothing environment-specific is baked in.

FROM node:24.21.0-trixie-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @surefy/workspace...
RUN pnpm --filter @surefy/workspace build

FROM node:24.21.0-trixie-slim
RUN useradd --system --uid 10001 --no-create-home surefy
WORKDIR /app
# The standalone output keeps the monorepo layout, so the server sits at apps/workspace/server.js.
COPY --from=build /repo/apps/workspace/.next/standalone ./
COPY --from=build /repo/apps/workspace/.next/static ./apps/workspace/.next/static
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
USER surefy
EXPOSE 3000
CMD ["node", "apps/workspace/server.js"]
