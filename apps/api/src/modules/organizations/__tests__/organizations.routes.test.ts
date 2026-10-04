// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { organizations, organizationSlugHistory } from '@/database/tables/index.js'
import { ERROR_CODES, organizationDtoSchema, slugAvailabilityDtoSchema } from '@surefy/contracts'

import { newId } from '../../../../test/factories/index.js'
import { setupTwoOrgs } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectError, request } from '../../../../test/helpers/request.js'
import { getTestDatabase } from '../../../../test/helpers/testDatabase.js'
import {
  assertTenantIsolation,
  checkCrossTenantCase,
  crossTenantCases,
  type OrgScopedRoute,
} from '../../../../test/isolation/index.js'
import { createOrganizationsModule } from '../organizations.module.js'

import type { TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'

const orgUrl = (orgId: string) => `/api/v1/orgs/${orgId}`

describe('GET /orgs/:orgId', () => {
  it('returns the organization with its settings defaults to every member', async () => {
    const { app, a, sessionOf } = await setupTwoOrgs()
    const organization = expectData(
      await request(app, 'GET', orgUrl(a.id), { headers: sessionOf(a.members.uma) }),
      200,
      organizationDtoSchema,
    )
    expect(organization).toMatchObject({
      id: a.id,
      name: 'Acme Research',
      slug: a.slug,
      status: 'active',
      timezone: 'UTC',
      settings: {
        version: 1,
        security: { require2fa: false, sessionMaxHours: null },
        privacy: { chatSharingEnabled: true },
        setup: { skippedSteps: [] },
      },
    })
  })

  it('answers 401 without a session', async () => {
    const { app, a } = await setupTwoOrgs()
    expectError(await request(app, 'GET', orgUrl(a.id)), 401, ERROR_CODES.AUTH_UNAUTHENTICATED)
  })
})

describe('PATCH /orgs/:orgId', () => {
  it('updates the name, regional settings and settings sparsely', async () => {
    const { app, a, sessionOf } = await setupTwoOrgs()
    const headers = sessionOf(a.members.adam)
    await request(app, 'PATCH', orgUrl(a.id), {
      headers,
      payload: { settings: { security: { require2fa: true } } },
    })
    const updated = expectData(
      await request(app, 'PATCH', orgUrl(a.id), {
        headers,
        payload: {
          name: 'Acme Labs',
          timezone: 'Europe/Berlin',
          currency: 'eur',
          settings: { security: { sessionMaxHours: 12 } },
        },
      }),
      200,
      organizationDtoSchema,
    )
    expect(updated).toMatchObject({
      name: 'Acme Labs',
      timezone: 'Europe/Berlin',
      currency: 'EUR',
      settings: { security: { require2fa: true, sessionMaxHours: 12 } },
    })
  })

  it('refuses a User (settings:manage) and an unknown time zone', async () => {
    const { app, a, sessionOf } = await setupTwoOrgs()
    expectError(
      await request(app, 'PATCH', orgUrl(a.id), {
        headers: sessionOf(a.members.uma),
        payload: { name: 'Mine now' },
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await request(app, 'PATCH', orgUrl(a.id), {
        headers: sessionOf(a.members.adam),
        payload: { timezone: 'Mars/Olympus' },
      }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })

  it('changes the slug, keeps the old one redirecting, and takes it back later', async () => {
    const { app, a, b, sessionOf, container } = await setupTwoOrgs()
    const headers = sessionOf(a.members.olivia)
    const oldSlug = a.slug
    const renamed = expectData(
      await request(app, 'PATCH', orgUrl(a.id), { headers, payload: { slug: 'acme-labs' } }),
      200,
      organizationDtoSchema,
    )
    expect(renamed.slug).toBe('acme-labs')
    const service = container.modules.organizations.service
    expect(await service.resolveSlug(oldSlug)).toEqual({
      organizationId: a.id,
      currentSlug: 'acme-labs',
      isRedirect: true,
    })
    // Another organization cannot take a slug that still redirects.
    expectError(
      await request(app, 'PATCH', orgUrl(b.id), {
        headers: sessionOf(b.members.bea),
        payload: { slug: oldSlug },
      }),
      409,
      ERROR_CODES.ORGANIZATION_SLUG_TAKEN,
    )
    // The organization itself can take its recent slug back.
    const back = expectData(
      await request(app, 'PATCH', orgUrl(a.id), { headers, payload: { slug: oldSlug } }),
      200,
      organizationDtoSchema,
    )
    expect(back.slug).toBe(oldSlug)
    expect(await service.resolveSlug(oldSlug)).toMatchObject({ isRedirect: false })
    expect(await service.resolveSlug('acme-labs')).toMatchObject({ isRedirect: true })
  })

  it('refuses reserved and taken slugs', async () => {
    const { app, a, b, sessionOf } = await setupTwoOrgs()
    const headers = sessionOf(a.members.olivia)
    expectError(
      await request(app, 'PATCH', orgUrl(a.id), { headers, payload: { slug: 'settings' } }),
      409,
      ERROR_CODES.ORGANIZATION_SLUG_RESERVED,
    )
    expectError(
      await request(app, 'PATCH', orgUrl(a.id), { headers, payload: { slug: b.slug } }),
      409,
      ERROR_CODES.ORGANIZATION_SLUG_TAKEN,
    )
  })
})

describe('POST /organizations', () => {
  it('is refused while the install creation policy allows nobody (Community default)', async () => {
    const { app, a, sessionOf } = await setupTwoOrgs()
    expectError(
      await request(app, 'POST', '/api/v1/organizations', {
        headers: sessionOf(a.members.olivia),
        payload: { name: 'Gamma', slug: 'gamma' },
      }),
      403,
      ERROR_CODES.ORGANIZATION_CREATION_NOT_ALLOWED,
    )
  })

  it('answers 401 without a session', async () => {
    const { app } = await setupTwoOrgs()
    expectError(
      await request(app, 'POST', '/api/v1/organizations', {
        payload: { name: 'Gamma', slug: 'gamma' },
      }),
      401,
      ERROR_CODES.AUTH_UNAUTHENTICATED,
    )
  })
})

describe('organization limit and creation (ADR 0016)', () => {
  const moduleWith = (setup: TwoOrgSetup, maxOrganizations: number | null) =>
    createOrganizationsModule({
      db: setup.db,
      storage: setup.container.integrations.storage,
      owners: setup.container.modules.members.memberships,
      installLimits: {
        name: maxOrganizations === null ? 'plan' : 'community',
        getInstallLimits: () => Promise.resolve({ maxOrganizations }),
      },
      creationRule: { mayCreateOrganization: () => Promise.resolve(true) },
    }).service

  it('refuses a third organization when the install allows two, with the limit details', async () => {
    const setup = await setupTwoOrgs()
    const service = moduleWith(setup, 2)
    expect(await service.canCreateOrganization(setup.a.members.uma.id)).toBe(false)
    const error = await service
      .create(
        { userId: setup.a.members.uma.id, requestId: 'r', via: 'user' },
        { name: 'Gamma', slug: 'gamma' },
      )
      .catch((caught: unknown) => caught)
    expect(error).toMatchObject({
      code: ERROR_CODES.LIMIT_REACHED,
      statusCode: 403,
      options: {
        details: [
          {
            limit: 'organizations',
            max: 2,
            used: 2,
            source: 'community',
            minimumEdition: 'enterprise',
          },
        ],
      },
    })
  })

  it('creates the organization with its creator as Owner, who can open it', async () => {
    const setup = await setupTwoOrgs()
    const service = moduleWith(setup, null)
    const person = setup.a.members.uma
    expect(await service.canCreateOrganization(person.id)).toBe(true)
    const created = await service.create(
      { userId: person.id, requestId: 'r', via: 'user' },
      { name: 'Gamma', slug: 'gamma', timezone: 'Asia/Tokyo' },
    )
    expect(created).toMatchObject({ name: 'Gamma', slug: 'gamma', timezone: 'Asia/Tokyo' })
    const opened = expectData(
      await request(setup.app, 'PATCH', orgUrl(created.id), {
        headers: setup.sessionOf(person),
        payload: { name: 'Gamma Group' },
      }),
      200,
      organizationDtoSchema,
    )
    expect(opened.name).toBe('Gamma Group')
  })

  it('lets guided setup create the first organization past the limit', async () => {
    const setup = await setupTwoOrgs()
    const service = moduleWith(setup, 1)
    const { organization, memberId } = await service.createWithOwner(
      { name: 'Setup Org', slug: 'setup-org' },
      { userId: setup.b.members.bea.id, provisioningSource: 'setup' },
      { enforceLimit: false },
    )
    expect(organization.slug).toBe('setup-org')
    expect(memberId).toEqual(expect.any(String))
  })

  it('refuses a reserved or taken slug at creation', async () => {
    const setup = await setupTwoOrgs()
    const service = moduleWith(setup, null)
    const owner = { userId: setup.a.members.uma.id, provisioningSource: 'setup' as const }
    await expect(
      service.createWithOwner({ name: 'X', slug: 'admin' }, owner),
    ).rejects.toMatchObject({ code: ERROR_CODES.ORGANIZATION_SLUG_RESERVED })
    await expect(
      service.createWithOwner({ name: 'X', slug: setup.a.slug }, owner),
    ).rejects.toMatchObject({ code: ERROR_CODES.ORGANIZATION_SLUG_TAKEN })
  })
})

describe('GET /organizations/slug-availability', () => {
  it('says whether a slug is free, taken, reserved or invalid, without a session', async () => {
    const { app, a } = await setupTwoOrgs()
    const check = async (slug: string) =>
      expectData(
        await request(app, 'GET', '/api/v1/organizations/slug-availability', { query: { slug } }),
        200,
        slugAvailabilityDtoSchema,
      )
    expect(await check('Fresh-Name')).toEqual({ slug: 'fresh-name', available: true, reason: null })
    expect(await check(a.slug)).toEqual({ slug: a.slug, available: false, reason: 'taken' })
    expect(await check('login')).toEqual({ slug: 'login', available: false, reason: 'reserved' })
    expect(await check('-x')).toEqual({ slug: '-x', available: false, reason: 'invalid' })
  })
})

describe('definer functions', () => {
  it('are executable by the app role only and ignore a hostile search_path', async () => {
    const { owner } = getTestDatabase()
    const result = await owner.global.execute<{ name: string; public: boolean; app: boolean }>(sql`
      select p.proname as name,
        has_function_privilege('public', p.oid, 'execute') as public,
        has_function_privilege('surefy_app', p.oid, 'execute') as app
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('organization_slug_available', 'organization_resolve_slug',
          'install_organization_count', 'invitation_resolve_token', 'invitation_list_for_email',
          'invitation_pending_for_email')
      order by p.proname`)
    expect(result.rows).toHaveLength(6)
    expect(result.rows.every((row) => !row.public && row.app)).toBe(true)

    // A temporary `organizations` first on the search path: the function still counts public's.
    const count = await owner.global.transaction(async (tx) => {
      await tx.execute(sql`create temporary table organizations (id uuid) on commit drop`)
      await tx.execute(sql`insert into pg_temp.organizations values (gen_random_uuid())`)
      await tx.execute(sql`set local search_path = pg_temp, public`)
      const rows = await tx.execute<{ count: number }>(
        sql`select public.install_organization_count() as count`,
      )
      return rows.rows[0]?.count
    })
    expect(count).toBe(0)
  })

  it('count every organization, whatever its status, and never cross into a redirect after it expires', async () => {
    const { app, a, sessionOf, container } = await setupTwoOrgs()
    const asSystem = (query: ReturnType<typeof sql>) =>
      getTestDatabase().db.system('test', (tx) => tx.execute(query))
    await asSystem(
      sql`update ${organizations} set status = 'suspended', suspended_at = now() where id = ${a.id}`,
    )
    const counted = await getTestDatabase().db.global.execute<{ count: number }>(
      sql`select install_organization_count() as count`,
    )
    expect(counted.rows[0]?.count).toBe(2)
    await asSystem(sql`update ${organizations} set status = 'active', suspended_at = null`)
    const service = container.modules.organizations.service
    const oldSlug = a.slug
    await request(app, 'PATCH', orgUrl(a.id), {
      headers: sessionOf(a.members.olivia),
      payload: { slug: 'acme-new' },
    })
    await asSystem(
      sql`update ${organizationSlugHistory} set redirect_until = now() - interval '1 day'`,
    )
    expect(await service.resolveSlug(oldSlug)).toBeUndefined()
    expect(await service.slugAvailability(oldSlug)).toMatchObject({ available: true })
    expect(await service.resolveSlug(newId())).toBeUndefined()
  })
})

describe('tenant isolation', () => {
  const routes: OrgScopedRoute[] = [
    { method: 'GET', path: '/orgs/:orgId' },
    { method: 'PATCH', path: '/orgs/:orgId', payload: { name: 'Taken over' } },
  ]

  it.each(routes)(
    "answers 404 ORGANIZATION_NOT_FOUND on A's $method $path to B's Owner",
    async (route) => {
      const setup = await setupTwoOrgs()
      const subjects = setup.subjects({}, [setup.a.id, setup.a.slug, 'Acme Research'])
      // Organization-level routes: B's own orgId is B's data, so only A's orgId is checked here.
      const cases = crossTenantCases(route, subjects).filter((c) => c.expected.code !== undefined)
      for (const testCase of cases) {
        expect(await checkCrossTenantCase(setup.app, testCase, subjects.orgA.markers)).toEqual([])
      }
    },
  )

  it('holds at the database layer for retired slugs (tenant policy, FORCE RLS)', async () => {
    const setup = await setupTwoOrgs()
    await expect(
      assertTenantIsolation(
        setup.db,
        {
          table: organizationSlugHistory,
          organizationId: organizationSlugHistory.organizationId,
          row: (orgId) => ({
            organizationId: orgId,
            slug: `old-${orgId.slice(0, 8)}`,
            redirectUntil: new Date(Date.now() + 86_400_000),
          }),
        },
        { a: setup.a.id, b: setup.b.id },
      ),
    ).resolves.toBeUndefined()
  })

  it('shows a person only the organizations they actively belong to (tenant+member-read)', async () => {
    const setup = await setupTwoOrgs()
    const { db } = setup
    const visible = async (userId: string) =>
      (
        await db.user(userId, (tx) =>
          tx.select({ id: organizations.id }).from(organizations).orderBy(organizations.name),
        )
      ).map((row) => row.id)
    expect(await visible(setup.a.members.uma.id)).toEqual([setup.a.id])
    expect(await visible(setup.b.members.bea.id)).toEqual([setup.b.id])
    await getTestDatabase().db.system('test', (tx) =>
      tx.execute(sql`update organization_members set status = 'deactivated', deactivated_at = now()
          where user_id = ${setup.a.members.uma.id}`),
    )
    expect(await visible(setup.a.members.uma.id)).toEqual([])
    // Under db.tenant only the tenant itself; writes to another organization fail.
    const underB = await db.tenant(setup.b.id, (tx) =>
      tx.select({ id: organizations.id }).from(organizations),
    )
    expect(underB.map((row) => row.id)).toEqual([setup.b.id])
  })
})
