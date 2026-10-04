// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'

import type { DbExecutor } from '@/core/database/index.js'

/**
 * The lists the guard queries take (conventions-and-security.md, "FORCE RLS and the CI check").
 * They live next to the test; the private repositories run the same guards with theirs added.
 */
export interface SchemaGuardLists {
  /** Tables without RLS on purpose (`none` family): Better Auth, install tables, overrides. */
  globalTables: readonly string[]
  /** Tables `surefy_app` may only read and insert. */
  appendOnlyTables: readonly string[]
  /** Join tables that have no `(organization_id, id)` unique key because they have no `id`. */
  joinTables: readonly string[]
}

export type SchemaGuard =
  | 'policy-table-without-force-rls-or-unlisted-table-without-rls'
  | 'rls-table-without-policy'
  | 'app-role-reaches-partition'
  | 'app-role-writes-append-only-table'
  | 'function-executable-by-public-or-definer-without-set'
  | 'tenant-table-without-organization-id-id-key'
  | 'role-bypasses-rls'

export interface SchemaGuardFinding {
  guard: SchemaGuard
  object: string
}

const names = async (executor: DbExecutor, query: ReturnType<typeof sql>): Promise<string[]> => {
  const result = await executor.execute<{ name: string }>(query)
  return result.rows.map((row) => row.name)
}

const textArray = (list: readonly string[]) => sql`${sql.param([...list])}::text[]`

/**
 * The seven guard queries; every row returned is a finding that fails the build. Runs as the
 * owner (catalog views only) against a freshly migrated database.
 */
export async function runSchemaGuards(
  executor: DbExecutor,
  lists: SchemaGuardLists,
): Promise<SchemaGuardFinding[]> {
  const guards: Record<SchemaGuard, ReturnType<typeof sql>> = {
    'policy-table-without-force-rls-or-unlisted-table-without-rls': sql`
      select c.relname as name
      from pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p') and not c.relispartition
        and (
          (c.relrowsecurity and not c.relforcerowsecurity)
          or (not c.relrowsecurity and c.relname <> all (${textArray(lists.globalTables)}))
        )`,
    'rls-table-without-policy': sql`
      select c.relname as name from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relrowsecurity
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`,
    'app-role-reaches-partition': sql`
      select i.inhrelid::regclass::text as name from pg_inherits i
      where has_table_privilege('surefy_app', i.inhrelid, 'select,insert,update,delete')`,
    'app-role-writes-append-only-table': sql`
      select t as name from unnest(${textArray(lists.appendOnlyTables)}) t
      where has_table_privilege('surefy_app', t, 'update')
         or has_table_privilege('surefy_app', t, 'delete')`,
    // PUBLIC is grantee 0 in an ACL; a null ACL means the type's defaults, which grant EXECUTE.
    'function-executable-by-public-or-definer-without-set': sql`
      select p.proname as name from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.oid not in (select objid from pg_depend where deptype = 'e')
        and (
          exists (
            select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
            where acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
          or (p.prosecdef and not (p.proconfig @> array['app.scope=system']
                                   and exists (select 1 from unnest(p.proconfig) s where s like 'search_path=%')))
        )`,
    'tenant-table-without-organization-id-id-key': sql`
      select c.relname as name from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id'
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relispartition
        and a.attnotnull
        and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.conname = c.relname || '_organization_id_id_key')
        and not exists (select 1 from pg_index i where i.indrelid = c.oid and i.indisunique
                        and i.indexrelid::regclass::text = c.relname || '_organization_id_id_key')
        and c.relname <> all (${textArray(lists.joinTables)})`,
    'role-bypasses-rls': sql`
      select rolname as name from pg_roles
      where rolname in ('surefy_owner', 'surefy_app') and (rolsuper or rolbypassrls)`,
  }

  const findings: SchemaGuardFinding[] = []
  for (const [guard, query] of Object.entries(guards) as [SchemaGuard, ReturnType<typeof sql>][]) {
    for (const object of await names(executor, query)) findings.push({ guard, object })
  }
  return findings
}
