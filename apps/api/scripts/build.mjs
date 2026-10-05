// SPDX-License-Identifier: AGPL-3.0-only
import { cpSync, readFileSync, rmSync } from 'node:fs'

import { build } from 'esbuild'

/**
 * The production build: one ESM bundle per process (`server`, `worker`, `cli`, `migrate`) in
 * `dist/`. The workspace packages (`@surefy/*`) ship as TypeScript source and are bundled in; every
 * other dependency stays external and is installed next to the bundle. The SQL migrations are
 * copied to `dist/migrations`, next to the bundle that runs them.
 */
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@surefy/'))

rmSync('dist', { recursive: true, force: true })

await build({
  entryPoints: {
    server: 'src/server.ts',
    worker: 'src/worker.ts',
    cli: 'src/cli.ts',
    migrate: 'src/database/migrate.ts',
  },
  outdir: 'dist',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  sourcemap: 'linked',
  tsconfig: 'tsconfig.json',
  external,
  logLevel: 'info',
})

cpSync('src/database/migrations', 'dist/migrations', { recursive: true })
