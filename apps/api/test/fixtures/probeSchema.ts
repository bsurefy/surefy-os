// SPDX-License-Identifier: AGPL-3.0-only
import * as drizzleKit from 'drizzle-kit/api'
import { sql } from 'drizzle-orm'

import { probeSchema } from './probe.tables.js'

import type { Database } from '@/core/database/index.js'

type Casing = 'snake_case' | 'camelCase'
interface Snapshot {
  id: string
}
/** The two functions used, typed here: drizzle-kit's declarations are written against zod 3. */
interface SnapshotTools {
  generateDrizzleJson: (
    imports: Record<string, unknown>,
    prevId?: string,
    schemaFilters?: string[],
    casing?: Casing,
  ) => Snapshot
  generateMigration: (prev: Snapshot, cur: Snapshot) => Promise<string[]>
}
const { generateDrizzleJson, generateMigration } = drizzleKit as unknown as SnapshotTools

/**
 * Creates the probe tables in the current test database the way a migration would: the DDL
 * drizzle-kit generates from the table definitions (CREATE TABLE, ENABLE ROW LEVEL SECURITY,
 * CREATE POLICY), run as `surefy_owner`, plus the FORCE RLS statement of the custom migration.
 * The default privileges of migration 0000 give `surefy_app` its DML rights on the new tables.
 */
export async function installProbeSchema(owner: Database): Promise<void> {
  const empty = generateDrizzleJson({}, undefined, undefined, 'snake_case')
  const current = generateDrizzleJson(probeSchema, empty.id, undefined, 'snake_case')
  const statements = await generateMigration(empty, current)
  await owner.global.transaction(async (tx) => {
    for (const statement of statements) await tx.execute(sql.raw(statement))
    await tx.execute(sql`alter table probe_items force row level security`)
  })
}
