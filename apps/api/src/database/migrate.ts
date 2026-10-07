// SPDX-License-Identifier: AGPL-3.0-only
import { fileURLToPath } from 'node:url'

import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { createContainer } from '@/container.js'
import { loadConfig } from '@/core/config/index.js'

import type { MigrationsFolder } from '@/core/extensions/index.js'

/** All migrations tables live in the `drizzle` schema, where the app role has no privileges. */
export const MIGRATIONS_SCHEMA = 'drizzle'
export const CORE_MIGRATIONS: MigrationsFolder = {
  path: fileURLToPath(new URL('./migrations', import.meta.url)),
  table: '__drizzle_migrations',
}

/**
 * The release step behind `pnpm db:migrate`: connects as `surefy_owner` and applies the core
 * folder, then each installed extension's folder, each with its own migrations table (Drizzle
 * skips migrations older than the last one recorded in a table). Never runs at boot.
 */
export async function runMigrations(): Promise<void> {
  const config = loadConfig('cli')
  const connectionString = config.database.migrationUrl
  if (connectionString === undefined) {
    throw new Error('DATABASE_MIGRATION_URL (the surefy_owner role) is required by db:migrate')
  }

  // The container loads the extensions exactly as the API does, to collect their folders.
  const container = await createContainer(config)
  const folders = [CORE_MIGRATIONS, ...container.extensions.migrationsFolders]
  const pool = new Pool({ connectionString, max: 1 })
  try {
    const db = drizzle({ client: pool })
    for (const folder of folders) {
      container.logger.info({ folder: folder.path, table: folder.table }, 'applying migrations')
      await migrate(db, {
        migrationsFolder: folder.path,
        migrationsTable: folder.table,
        migrationsSchema: MIGRATIONS_SCHEMA,
      })
    }
    container.logger.info({ folders: folders.length }, 'migrations applied')
  } finally {
    await pool.end()
    await container.close()
  }
}

await runMigrations()
