// SPDX-License-Identifier: AGPL-3.0-only
import { buildApp } from '@/app.js'
import { createContainer, type Container, type Integrations } from '@/container.js'
import { parseConfig, type Config } from '@/core/config/index.js'
import { createDatabase, type Database } from '@/core/database/index.js'

import { onFileTeardown } from './cleanup.js'
import { getTestDatabase } from './testDatabase.js'

import type { TenantAccessResolver } from '@/plugins/access.plugin.js'
import type { FastifyInstance } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface TestAppOptions {
  /** Environment overrides on top of the test database's environment (`API_DOCS_ENABLED`…). */
  env?: Record<string, string>
  /** Fakes for the external providers; the default is local storage in a temporary folder. */
  integrations?: Integrations
  /** Route plugins registered under /api/v1 after the module routes (probe routes in harness tests). */
  routes?: readonly FastifyPluginAsyncZod[]
  /** Extension names to report as loaded; no private package is imported either way. */
  extensions?: readonly string[]
  /** Replaces the membership resolver of `app.authorize()`; by default real memberships decide. */
  tenants?: TenantAccessResolver
}

export interface TestApp {
  app: FastifyInstance
  container: Container
  config: Config
  /** The app's own `Database`, connected as `surefy_app`. */
  db: Database
  /** The file's `surefy_owner` client, for fixtures that need DDL. */
  owner: Database
  close(): Promise<void>
}

/**
 * The real container (`createContainer`) and the real Fastify app (`buildApp`) over this file's
 * database and Redis, with fake integrations (testing.md, §3). The app is closed when the file
 * ends, so tests may call this inline; `close()` is for tests that need it earlier.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const testDatabase = getTestDatabase()
  const config = parseConfig('api', { ...testDatabase.env, ...options.env })
  const logger = testDatabase.logger
  const db = createDatabase(config, logger)
  const base = await createContainer(config, {
    logger,
    db,
    extensions: options.extensions ?? [],
    ...(options.integrations === undefined ? {} : { integrations: options.integrations }),
    ...(options.tenants === undefined ? {} : { tenants: options.tenants }),
  })
  const container: Container = {
    ...base,
    extensions: {
      ...base.extensions,
      routes: [...base.extensions.routes, ...(options.routes ?? [])],
    },
  }
  const app = await buildApp(container)
  await app.ready()

  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    await app.close()
    await container.close()
  }
  onFileTeardown(close)
  return { app, container, config, db, owner: testDatabase.owner, close }
}
