// SPDX-License-Identifier: AGPL-3.0-only
import { count, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { ERROR_CODES } from '@surefy/contracts'

import { SCHEMA_GUARD_LISTS } from './database/schemaGuardLists.js'
import { runSchemaGuards } from './database/schemaGuards.js'
import { defineTableFactory, newId } from './factories/index.js'
import { probeItems, probeLeaks } from './fixtures/probe.tables.js'
import { createProbeRoutes, PROBE_ACTOR_HEADER, probeItemSchema } from './fixtures/probeRoutes.js'
import { installProbeSchema } from './fixtures/probeSchema.js'
import { expectData, expectError, request } from './helpers/request.js'
import { createTestApp } from './helpers/testApp.js'
import { getTestDatabase } from './helpers/testDatabase.js'
import {
  assertRouteIsolation,
  assertTenantIsolation,
  collectTenantLeaks,
  failedQueryState,
  IsolationError,
  RLS_VIOLATION,
  type CrossTenantSubjects,
  type TenantProbe,
} from './isolation/index.js'

import type { DbExecutor } from '@/core/database/index.js'

const orgs = { a: newId(), b: newId() }

const probeItemFactory = defineTableFactory(probeItems, (seq) => ({
  organizationId: orgs.a,
  name: `Probe ${seq}`,
}))

const itemsProbe: TenantProbe<typeof probeItems> = {
  table: probeItems,
  organizationId: probeItems.organizationId,
  row: (orgId) => probeItemFactory.build({ organizationId: orgId }),
}
const leaksProbe: TenantProbe<typeof probeLeaks> = {
  table: probeLeaks,
  organizationId: probeLeaks.organizationId,
  row: (orgId) => ({ organizationId: orgId, name: `Leak ${orgId.slice(0, 8)}` }),
}

const countItems = async (tx: DbExecutor, orgId?: string): Promise<number> => {
  const query = tx.select({ n: count() }).from(probeItems)
  const rows =
    orgId === undefined ? await query : await query.where(eq(probeItems.organizationId, orgId))
  return rows[0]?.n ?? 0
}

const seedBothOrgs = () =>
  getTestDatabase().db.system('test', async (tx) => {
    await probeItemFactory.create(tx, { organizationId: orgs.a, name: 'Alpha secret' })
    await probeItemFactory.create(tx, { organizationId: orgs.b, name: 'Beta secret' })
  })

type RoleRow = Record<'name' | 'rolsuper' | 'rolbypassrls', unknown>
const whoAmI = async (executor: DbExecutor): Promise<RoleRow | undefined> => {
  const result = await executor.execute<RoleRow>(
    sql`select current_user as name, rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
  )
  return result.rows[0]
}

describe('test harness', () => {
  beforeAll(async () => {
    await installProbeSchema(getTestDatabase().owner)
  })

  describe('roles', () => {
    it('connects the app as surefy_app, which is neither a superuser nor BYPASSRLS', async () => {
      const { db, owner } = getTestDatabase()
      expect(await whoAmI(db.global)).toEqual({
        name: 'surefy_app',
        rolsuper: false,
        rolbypassrls: false,
      })
      expect(await whoAmI(owner.global)).toEqual({
        name: 'surefy_owner',
        rolsuper: false,
        rolbypassrls: false,
      })
    })

    it('migrated the template as the owner, in a schema the app role cannot reach', async () => {
      const { db, owner } = getTestDatabase()
      const applied = await owner.global.execute<{ n: number }>(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      )
      expect(applied.rows[0]?.n).toBeGreaterThanOrEqual(1)
      await expect(
        db.global.execute(sql`select count(*) from drizzle.__drizzle_migrations`),
      ).rejects.toSatisfy((error: unknown) => failedQueryState(error) === RLS_VIOLATION)
    })

    it('gives the app role DML on tables the owner creates (default privileges), but no TRUNCATE', async () => {
      const { db } = getTestDatabase()
      const privileges = await db.global.execute<{ privilege: string; granted: boolean }>(sql`
        select p as privilege, has_table_privilege('surefy_app', 'probe_items', p) as granted
        from unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p`)
      expect(
        Object.fromEntries(privileges.rows.map((row) => [row.privilege, row.granted])),
      ).toEqual({ select: true, insert: true, update: true, delete: true, truncate: false })
    })
  })

  describe('row-level security through the transaction helpers', () => {
    it('lets db.tenant see only its organization, db.system everything, and no scope nothing', async () => {
      const { db } = getTestDatabase()
      await seedBothOrgs()

      expect(await db.tenant(orgs.a, (tx) => countItems(tx))).toBe(1)
      expect(await db.tenant(orgs.a, (tx) => countItems(tx, orgs.b))).toBe(0)
      expect(await db.tenant(orgs.b, (tx) => countItems(tx))).toBe(1)
      expect(await db.system('test', (tx) => countItems(tx))).toBe(2)
      expect(await countItems(db.global)).toBe(0)
      expect(await db.user(newId(), (tx) => countItems(tx))).toBe(0)
    })

    it('refuses writes to another organization under db.tenant', async () => {
      const { db } = getTestDatabase()
      await seedBothOrgs()

      await expect(
        db.tenant(orgs.a, (tx) => probeItemFactory.create(tx, { organizationId: orgs.b })),
      ).rejects.toSatisfy((error: unknown) => failedQueryState(error) === RLS_VIOLATION)

      const touched = await db.tenant(orgs.a, async (tx) => {
        const updated = await tx
          .update(probeItems)
          .set({ name: 'taken over' })
          .where(eq(probeItems.organizationId, orgs.b))
          .returning()
        const deleted = await tx
          .delete(probeItems)
          .where(eq(probeItems.organizationId, orgs.b))
          .returning()
        return updated.length + deleted.length
      })
      expect(touched).toBe(0)
      expect(await db.system('test', (tx) => countItems(tx, orgs.b))).toBe(1)
    })

    it('binds the owner role too (FORCE ROW LEVEL SECURITY)', async () => {
      const { owner } = getTestDatabase()
      await seedBothOrgs()
      expect(await countItems(owner.global)).toBe(0)
      expect(await owner.tenant(orgs.a, (tx) => countItems(tx))).toBe(1)
      expect(await owner.system('test', (tx) => countItems(tx))).toBe(2)
    })
  })

  describe('isolation between tests', () => {
    it('leaves rows behind on purpose', async () => {
      await seedBothOrgs()
      expect(await getTestDatabase().db.system('test', (tx) => countItems(tx))).toBe(2)
    })

    it('starts with empty tables', async () => {
      expect(await getTestDatabase().db.system('test', (tx) => countItems(tx))).toBe(0)
    })
  })

  describe('isolation helpers', () => {
    it('pass a tenant table with its policy and FORCE RLS', async () => {
      await expect(
        assertTenantIsolation(getTestDatabase().db, itemsProbe, orgs),
      ).resolves.toBeUndefined()
    })

    it('report every leak of a table without a policy', async () => {
      const findings = await collectTenantLeaks(getTestDatabase().db, leaksProbe, orgs)
      expect(findings).toEqual([
        expect.stringContaining('db.tenant(B) reads 1 row(s) of A'),
        expect.stringContaining('without a tenant filter'),
        expect.stringContaining('db.tenant(B) updates 1 row(s) of A'),
        expect.stringContaining('db.tenant(B) deletes 1 row(s) of A'),
        expect.stringContaining('db.tenant(B) inserts a row for A'),
        expect.stringContaining('visible with no scope'),
        expect.stringContaining('visible under db.user'),
      ])
      await expect(assertTenantIsolation(getTestDatabase().db, leaksProbe, orgs)).rejects.toThrow(
        IsolationError,
      )
    })
  })

  describe('schema guards', () => {
    it('report the table without RLS and a policy table without FORCE', async () => {
      const { owner } = getTestDatabase()
      const lists = { ...SCHEMA_GUARD_LISTS, joinTables: ['probe_items', 'probe_leaks'] }

      expect(await runSchemaGuards(owner.global, lists)).toEqual([
        {
          guard: 'policy-table-without-force-rls-or-unlisted-table-without-rls',
          object: 'probe_leaks',
        },
      ])

      await owner.global.execute(sql`alter table probe_items no force row level security`)
      try {
        expect(await runSchemaGuards(owner.global, lists)).toContainEqual({
          guard: 'policy-table-without-force-rls-or-unlisted-table-without-rls',
          object: 'probe_items',
        })
      } finally {
        await owner.global.execute(sql`alter table probe_items force row level security`)
      }
    })

    it('report a tenant table without the (organization_id, id) unique key', async () => {
      const findings = await runSchemaGuards(getTestDatabase().owner.global, {
        ...SCHEMA_GUARD_LISTS,
        globalTables: [...SCHEMA_GUARD_LISTS.globalTables, 'probe_leaks'],
      })
      expect(findings.map((finding) => finding.object).sort((a, b) => a.localeCompare(b))).toEqual([
        'probe_items',
        'probe_leaks',
      ])
      expect(findings.every((f) => f.guard === 'tenant-table-without-organization-id-id-key')).toBe(
        true,
      )
    })
  })

  describe('factories', () => {
    it('build unique rows and create them in the scope of the caller', async () => {
      const { db } = getTestDatabase()
      const [first, second] = probeItemFactory.buildMany(2)
      expect(first?.name).not.toBe(second?.name)
      expect(probeItemFactory.build({ name: 'fixed' }).name).toBe('fixed')

      const created = await db.tenant(orgs.a, (tx) => probeItemFactory.createMany(tx, 3))
      expect(created).toHaveLength(3)
      expect(new Set(created.map((row) => row.id)).size).toBe(3)
      expect(created.every((row) => row.organizationId === orgs.a)).toBe(true)
    })
  })

  describe('createTestApp', () => {
    it('serves the real app over the test database and Redis', async () => {
      const { app } = await createTestApp()
      const ready = await request(app, 'GET', '/health/ready')
      expect(ready.statusCode).toBe(200)
      expect(ready.json()).toEqual({
        data: { status: 'ok', checks: { database: 'ok', redis: 'ok' }, extensions: [] },
      })
    })

    it('answers org-scoped probe routes through plugins, RLS and the reply helpers', async () => {
      const { app, db } = await createTestApp({ routes: [createProbeRoutes(getTestDatabase().db)] })
      const item = await db.tenant(orgs.a, (tx) => probeItemFactory.create(tx))
      const url = `/api/v1/orgs/${orgs.a}/probes/${item.id}`

      const own = await request(app, 'GET', url, { headers: { [PROBE_ACTOR_HEADER]: orgs.a } })
      expect(expectData(own, 200, probeItemSchema)).toEqual(item)

      const other = await request(app, 'GET', url, { headers: { [PROBE_ACTOR_HEADER]: orgs.b } })
      expectError(other, 404, ERROR_CODES.ORGANIZATION_NOT_FOUND)

      const anonymous = await request(app, 'GET', url)
      expectError(anonymous, 401, ERROR_CODES.AUTH_UNAUTHENTICATED)
    })

    it('runs the cross-tenant attempts of a route and reports a leaky one', async () => {
      const { app, db } = await createTestApp({ routes: [createProbeRoutes(getTestDatabase().db)] })
      const item = await db.tenant(orgs.a, (tx) =>
        probeItemFactory.create(tx, { name: 'Alpha secret' }),
      )
      const subjects: CrossTenantSubjects = {
        orgA: { id: orgs.a, params: { probeId: item.id }, markers: [item.id, item.name] },
        orgB: { id: orgs.b, session: { [PROBE_ACTOR_HEADER]: orgs.b } },
      }

      await assertRouteIsolation(
        app,
        { method: 'GET', path: '/orgs/:orgId/probes/:probeId' },
        subjects,
      )

      const leaky = assertRouteIsolation(
        app,
        { method: 'GET', path: '/orgs/:orgId/leaky/:probeId' },
        subjects,
      )
      await expect(leaky).rejects.toThrow(IsolationError)
      await expect(leaky).rejects.toThrow('body contains "Alpha secret"')
    })
  })
})
