// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from '@/database/tables/index.js'

import { assertNoActiveScope, runInScope } from './scope.js'
import { withTransientRetry } from './withTransientRetry.js'

import type { SystemScopeReason } from './systemReasons.js'
import type { Config } from '@/core/config/index.js'
import type { Logger } from '@/core/logger/index.js'

export type Db = NodePgDatabase<typeof schema>
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]
/** What repositories receive: a transaction (normal case) or the database. */
export type DbExecutor = Db | DbTransaction

export type TransactionFn<T> = (tx: DbTransaction) => Promise<T>

export interface Database {
  /** Runs fn in a transaction scoped to one organization (RLS: app.org_id). */
  tenant<T>(orgId: string, fn: TransactionFn<T>): Promise<T>
  /** Runs fn as one person, without a tenant (RLS: app.user_id). Only for /me endpoints. */
  user<T>(userId: string, fn: TransactionFn<T>): Promise<T>
  /** Runs fn with cross-tenant access. Only for system jobs and private platform modules. */
  system<T>(reason: SystemScopeReason, fn: TransactionFn<T>): Promise<T>
  /** For tables without RLS only: Better Auth tables, install tables, model catalog overrides. */
  global: Db
  ping(): Promise<void>
  close(): Promise<void>
}

export interface DatabaseOptions {
  /** The connection string; defaults to `config.database.url` (the `surefy_app` role). */
  connectionString?: string
}

/**
 * The Drizzle client over a `pg` pool. Connections open lazily, on the first query. Every helper
 * sets its context with `set_config(…, true)`, which is transaction-local: a pooled connection
 * never carries one request's tenant into the next.
 */
export function createDatabase(
  config: Config,
  logger: Logger,
  options: DatabaseOptions = {},
): Database {
  const pool = new Pool({
    connectionString: options.connectionString ?? config.database.url,
    max: config.database.poolSize,
  })
  pool.on('error', (error) => {
    // An idle client lost its connection; the pool replaces it, this is only worth a line.
    logger.warn({ err: error }, 'database pool client error')
  })
  const db = drizzle({ client: pool, schema, casing: 'snake_case' })

  const scoped = <T>(
    scope: Parameters<typeof runInScope>[0],
    setting: ReturnType<typeof sql>,
    fn: TransactionFn<T>,
  ): Promise<T> => {
    assertNoActiveScope()
    return withTransientRetry(() =>
      db.transaction(async (tx) => {
        await tx.execute(setting)
        return runInScope(scope, () => fn(tx))
      }),
    )
  }

  return {
    tenant: (orgId, fn) =>
      scoped({ kind: 'tenant', orgId }, sql`select set_config('app.org_id', ${orgId}, true)`, fn),
    user: (userId, fn) =>
      scoped({ kind: 'user', userId }, sql`select set_config('app.user_id', ${userId}, true)`, fn),
    system: (reason, fn) => {
      logger.info({ reason }, 'system database scope')
      return scoped(
        { kind: 'system', reason },
        sql`select set_config('app.scope', 'system', true)`,
        fn,
      )
    },
    global: db,
    async ping() {
      await pool.query('select 1')
    },
    close: () => pool.end(),
  }
}
