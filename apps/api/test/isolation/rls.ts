// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'

import { count, eq, getTableName, sql } from 'drizzle-orm'

import { sqlState } from '@/core/database/index.js'

import { assertNoFindings } from './errors.js'

import type { Database, DbExecutor } from '@/core/database/index.js'
import type { PgColumn, PgInsertValue, PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core'

/** How to put one row of a `tenant`-family table into an organization. */
export interface TenantProbe<Table extends PgTable> {
  table: Table
  organizationId: PgColumn
  /** A complete, valid row for the organization. */
  row(orgId: string): PgInsertValue<Table>
}

export interface TwoOrgs {
  a: string
  b: string
}

/** Row-level security refuses a write with SQLSTATE 42501 (insufficient_privilege). */
export const RLS_VIOLATION = '42501'

const countRows = async (
  tx: DbExecutor,
  table: PgTable,
  organizationId?: { column: PgColumn; value: string },
): Promise<number> => {
  const query = tx.select({ n: count() }).from(table)
  const rows =
    organizationId === undefined
      ? await query
      : await query.where(eq(organizationId.column, organizationId.value))
  return rows[0]?.n ?? 0
}

/** The SQLSTATE of a failed query, read through Drizzle's wrapping error. */
export const failedQueryState = sqlState

/**
 * The `tenant` family (testing.md, §4), as `surefy_app`: seeds one row of A and one of B under
 * `db.system`, then checks that B's tenant scope cannot read, update, delete or insert A's rows
 * (even without a tenant filter in the query), that no scope at all and a user scope see nothing,
 * and that the system scope sees both. Returns the findings instead of throwing.
 */
export async function collectTenantLeaks<Table extends PgTable>(
  db: Database,
  probe: TenantProbe<Table>,
  orgs: TwoOrgs,
): Promise<string[]> {
  const { table, organizationId } = probe
  const name = getTableName(table)
  const findings: string[] = []
  const ofOrg = (value: string) => ({ column: organizationId, value })

  const seeded = await db.system('test', async (tx) => {
    await tx.insert(table).values(probe.row(orgs.a))
    await tx.insert(table).values(probe.row(orgs.b))
    return countRows(tx, table)
  })
  if (seeded < 2) findings.push(`db.system sees ${seeded} of the 2 seeded rows in ${name}`)

  await db.tenant(orgs.b, async (tx) => {
    const visibleA = await countRows(tx, table, ofOrg(orgs.a))
    if (visibleA > 0) findings.push(`db.tenant(B) reads ${visibleA} row(s) of A in ${name}`)
    const all = await countRows(tx, table)
    const ownB = await countRows(tx, table, ofOrg(orgs.b))
    if (all !== ownB) {
      findings.push(
        `a query without a tenant filter under db.tenant(B) returns ${all} row(s) of ${name}, ${ownB} belong to B`,
      )
    }
    // A no-op assignment: the column keeps its value, only the row count matters.
    const noop: Record<string, unknown> = { [organizationId.name]: sql`${organizationId}` }
    const updated = await tx
      .update(table)
      // eslint-disable-next-line @typescript-eslint/no-generated-empty-object-type -- Drizzle's set source has no shape for a generic table
      .set(noop as PgUpdateSetSource<Table>)
      .where(eq(organizationId, orgs.a))
      .returning({ organizationId })
    if (updated.length > 0) {
      findings.push(`db.tenant(B) updates ${updated.length} row(s) of A in ${name}`)
    }
    const deleted = await tx
      .delete(table)
      .where(eq(organizationId, orgs.a))
      .returning({ organizationId })
    if (deleted.length > 0) {
      findings.push(`db.tenant(B) deletes ${deleted.length} row(s) of A in ${name}`)
    }
  })

  // Its own transaction: a refused insert aborts the transaction it runs in.
  try {
    await db.tenant(orgs.b, async (tx) => {
      await tx.insert(table).values(probe.row(orgs.a))
    })
    findings.push(`db.tenant(B) inserts a row for A in ${name}`)
  } catch (error) {
    if (failedQueryState(error) !== RLS_VIOLATION) throw error
  }

  const unscoped = await countRows(db.global, table)
  if (unscoped > 0)
    findings.push(`${unscoped} row(s) of ${name} are visible with no scope (db.global)`)

  const asUser = await db.user(randomUUID(), (tx) => countRows(tx, table))
  if (asUser > 0) findings.push(`${asUser} row(s) of ${name} are visible under db.user`)

  return findings
}

/** `collectTenantLeaks`, throwing an `IsolationError` that lists every finding. */
export async function assertTenantIsolation<Table extends PgTable>(
  db: Database,
  probe: TenantProbe<Table>,
  orgs: TwoOrgs,
): Promise<void> {
  assertNoFindings(getTableName(probe.table), await collectTenantLeaks(db, probe, orgs))
}

/**
 * The second-layer check repository tests run (testing.md, §4): the given query, written
 * without a tenant filter, returns no row of A when it runs under `db.tenant(orgB)`.
 */
export async function expectNoRowsOfOtherTenant<Row>(
  db: Database,
  orgB: string,
  query: (tx: DbExecutor) => Promise<Row[]>,
  belongsToA: (row: Row) => boolean,
): Promise<void> {
  const rows = await db.tenant(orgB, query)
  const leaked = rows.filter((row) => belongsToA(row))
  assertNoFindings(
    'query under db.tenant(B)',
    leaked.length > 0 ? [`${leaked.length} row(s) of A returned under db.tenant(B)`] : [],
  )
}
