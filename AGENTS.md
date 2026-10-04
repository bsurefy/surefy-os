# Coding rules for contributors and their coding agents

Short rules for anyone (or any coding agent) changing this repository. The full contribution guide is [CONTRIBUTING.md](./CONTRIBUTING.md).

## Layout

- `apps/workspace` (Next.js web app), `apps/api` (Fastify API server and worker), `apps/ml` (Python FastAPI, internal only).
- `packages/contracts` (Zod schemas, error codes, permissions, feature keys; depends only on `zod`), `packages/ui` (design system, no data fetching), `packages/web-core` (frontend infrastructure), `packages/ml-client` (generated), `packages/config` (tsconfig, ESLint, Prettier).
- Apps never import other apps; packages never import apps; web apps reach the backend only over HTTP.

## Rules

- TypeScript 6.0.3, strict. Node.js 24. pnpm workspaces; Turborepo runs tasks: `pnpm turbo run lint typecheck test`.
- Prettier: no semicolons, single quotes, trailing commas, width 100.
- Every source file starts with `// SPDX-License-Identifier: AGPL-3.0-only` (`#` in Python and shell).
- Types that cross the HTTP boundary live in `@surefy/contracts`, never redeclared.
- Gate features with `FEATURES` keys (`requireFeature`, `useHasFeature`, `<FeatureGate>`); never check the edition.
- Every organization-scoped query runs through the tenant-scoped database helpers; row-level security is always on.
- Do not add Enterprise or Cloud logic here; add an extension point.
- New dependencies: latest stable version, an AGPL-compatible license, pinned exactly.
- Conventional Commits; branches from `develop`; one focused change per pull request, with tests.
