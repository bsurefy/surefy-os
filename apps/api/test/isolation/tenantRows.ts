// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'

import type { Database, DbExecutor } from '@/core/database/index.js'

/** A table holding tenant rows and the column naming their organization. */
export interface TenantTable {
  name: string
  column: string
}

/**
 * Every table with tenant rows, read from the catalog so new tables join on their own:
 * `organizations` by `id`, every other table with an `organization_id` column (partitions excluded).
 */
export async function tenantTables(db: Database): Promise<TenantTable[]> {
  const result = await db.global.execute<{ name: string }>(sql`
    select c.relname as name
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and a.attname = 'organization_id' and not a.attisdropped
      and c.relkind in ('r', 'p') and not c.relispartition
    order by c.relname`)
  return [
    { name: 'organizations', column: 'id' },
    ...result.rows.map((row) => ({ name: row.name, column: 'organization_id' })),
  ]
}

const rowsJson = async (tx: DbExecutor, table: TenantTable, orgId: string): Promise<string> => {
  const result = await tx.execute<{ rows: string }>(sql`
    select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb)::text as rows
    from ${sql.identifier(table.name)} t
    where ${sql.identifier(table.column)} = ${orgId}`)
  return result.rows[0]?.rows ?? '[]'
}

/** Every tenant row of the organization as JSON, per table, read under `db.system`. */
export function snapshotOrganization(db: Database, orgId: string): Promise<Map<string, string>> {
  return db.system('test', async (tx) => {
    const snapshot = new Map<string, string>()
    for (const table of await tenantTables(db)) {
      snapshot.set(table.name, await rowsJson(tx, table, orgId))
    }
    return snapshot
  })
}

/** The tables whose rows of the organization differ between two snapshots. */
export const changedTables = (
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): string[] =>
  [...new Set([...before.keys(), ...after.keys()])].filter(
    (name) => before.get(name) !== after.get(name),
  )

const countWhere = async (
  tx: DbExecutor,
  table: TenantTable,
  condition: ReturnType<typeof sql>,
) => {
  const result = await tx.execute<{ n: number }>(
    sql`select count(*)::int as n from ${sql.identifier(table.name)} where ${condition}`,
  )
  return result.rows[0]?.n ?? 0
}

/**
 * The second layer on its own (testing.md, §4; conventions-and-security.md, RLS): for every tenant
 * table, queries without a tenant filter under B's tenant scope, B's member's user scope and no
 * scope at all see none of A's rows, and B's tenant scope sees only B's (or global) rows. A table
 * with no row of A cannot prove anything, so it is a finding unless `unseeded` lists it.
 */
export async function collectDatabaseLeaks(
  db: Database,
  orgs: { a: string; b: string; bMemberUserId: string },
  unseeded: ReadonlySet<string> = new Set(),
): Promise<string[]> {
  const findings: string[] = []
  for (const table of await tenantTables(db)) {
    const column = sql.identifier(table.column)
    const ofA = sql`${column} = ${orgs.a}`
    const seeded = await db.system('test', (tx) => countWhere(tx, table, ofA))
    if (seeded === 0 && !unseeded.has(table.name)) {
      findings.push(`${table.name}: the fixture has no row of A, so nothing is proven`)
    }
    const tenantA = await db.tenant(orgs.b, (tx) => countWhere(tx, table, ofA))
    if (tenantA > 0) findings.push(`${table.name}: db.tenant(B) reads ${tenantA} row(s) of A`)
    const foreign = await db.tenant(orgs.b, (tx) =>
      countWhere(tx, table, sql`${column} is not null and ${column} <> ${orgs.b}`),
    )
    if (foreign > 0) {
      findings.push(`${table.name}: db.tenant(B) reads ${foreign} row(s) of other organizations`)
    }
    const userA = await db.user(orgs.bMemberUserId, (tx) => countWhere(tx, table, ofA))
    if (userA > 0) findings.push(`${table.name}: db.user(B's member) reads ${userA} row(s) of A`)
    const unscoped = await countWhere(db.global, table, sql`${column} is not null`)
    if (unscoped > 0)
      findings.push(`${table.name}: ${unscoped} tenant row(s) visible with no scope`)
  }
  return findings
}
