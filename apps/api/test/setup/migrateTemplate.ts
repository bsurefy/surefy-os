// SPDX-License-Identifier: AGPL-3.0-only
import { fileURLToPath } from 'node:url'

import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client, Pool } from 'pg'

import type { TestInfrastructure } from './infrastructure.js'

// The same folder, table and schema `src/database/migrate.ts` uses (it is a CLI entry point that
// runs on import, so the constants are repeated here rather than imported).
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../src/database/migrations', import.meta.url))
const MIGRATIONS_TABLE = '__drizzle_migrations'
const MIGRATIONS_SCHEMA = 'drizzle'

export const connectionUrl = (
  postgres: TestInfrastructure['postgres'],
  role: 'surefy_owner' | 'surefy_app',
  database: string,
): string => {
  const url = new URL('postgres://')
  url.hostname = postgres.host
  url.port = String(postgres.port)
  url.username = role
  url.password = role === 'surefy_owner' ? postgres.ownerPassword : postgres.appPassword
  url.pathname = database
  return url.toString()
}

/**
 * Applies the core migrations to the bootstrap database as `surefy_owner`, exactly like
 * `pnpm db:migrate`, then marks it as a template so test files can clone it without connecting.
 */
export async function migrateTemplate(postgres: TestInfrastructure['postgres']): Promise<void> {
  const pool = new Pool({
    connectionString: connectionUrl(postgres, 'surefy_owner', postgres.templateDatabase),
    max: 1,
  })
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsTable: MIGRATIONS_TABLE,
      migrationsSchema: MIGRATIONS_SCHEMA,
    })
  } finally {
    await pool.end()
  }

  const admin = new Client({ connectionString: postgres.adminUrl })
  await admin.connect()
  try {
    await admin.query(
      `alter database "${postgres.templateDatabase}" with is_template true allow_connections false`,
    )
  } finally {
    await admin.end()
  }
}
