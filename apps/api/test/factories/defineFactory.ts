// SPDX-License-Identifier: AGPL-3.0-only
import type { DbExecutor } from '@/core/database/index.js'
import type { PgInsertValue, PgTable } from 'drizzle-orm/pg-core'

/**
 * A factory builds valid rows (`build`) and persists them (`create`). Persisting takes the
 * executor of the enclosing `db.tenant` / `db.system` transaction, so the caller chooses the RLS
 * scope and a factory never opens a connection of its own. Every build gets an increasing
 * sequence number, so names and emails are unique without coordination between tests.
 */
export interface Factory<Row, Insert> {
  build(overrides?: Partial<Insert>): Insert
  buildMany(count: number, overrides?: Partial<Insert>): Insert[]
  create(tx: DbExecutor, overrides?: Partial<Insert>): Promise<Row>
  createMany(tx: DbExecutor, count: number, overrides?: Partial<Insert>): Promise<Row[]>
}

export interface FactoryDefinition<Row, Insert> {
  /** The default attributes of one row; `seq` is unique within the test file. */
  build(seq: number): Insert
  /** Persists one built row and returns what was stored. */
  insert(tx: DbExecutor, values: Insert): Promise<Row>
}

/** The general mechanism; `defineTableFactory` is the shortcut for one Drizzle table. */
export function defineFactory<Row, Insert>(
  definition: FactoryDefinition<Row, Insert>,
): Factory<Row, Insert> {
  let seq = 0
  const build = (overrides: Partial<Insert> = {}): Insert => ({
    ...definition.build(++seq),
    ...overrides,
  })
  const create = (tx: DbExecutor, overrides?: Partial<Insert>) =>
    definition.insert(tx, build(overrides))
  return {
    build,
    buildMany: (count, overrides) => Array.from({ length: count }, () => build(overrides)),
    create,
    async createMany(tx, count, overrides) {
      const rows: Row[] = []
      // Sequential on purpose: one transaction, one statement at a time.
      for (let index = 0; index < count; index += 1) rows.push(await create(tx, overrides))
      return rows
    },
  }
}

/**
 * A factory over one table: `insert … returning *`. Module factories are
 * `defineTableFactory(teams, (seq) => ({ organizationId: …, name: \`Team ${seq}\` }))`.
 */
export function defineTableFactory<Table extends PgTable>(
  table: Table,
  build: (seq: number) => PgInsertValue<Table>,
): Factory<Table['$inferSelect'], PgInsertValue<Table>> {
  return defineFactory<Table['$inferSelect'], PgInsertValue<Table>>({
    build,
    async insert(tx, values) {
      const rows = await tx.insert(table).values(values).returning()
      const row = rows[0]
      if (row === undefined) throw new Error('insert returned no row')
      return row
    },
  })
}
