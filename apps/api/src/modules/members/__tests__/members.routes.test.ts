// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { invitations, memberPreferences, organizationMembers } from '@/database/tables/index.js'
import {
  bulkMemberActionResultDtoSchema,
  ERROR_CODES,
  meDtoSchema,
  memberDtoSchema,
  memberPreferencesDtoSchema,
  teamDtoSchema,
} from '@surefy/contracts'

import { addMember } from '../../../../test/factories/index.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import {
  expectData,
  expectError,
  expectNoContent,
  expectPage,
  request,
} from '../../../../test/helpers/request.js'
import { getTestDatabase } from '../../../../test/helpers/testDatabase.js'
import {
  assertRouteIsolation,
  assertTenantIsolation,
  checkCrossTenantCase,
  crossTenantCases,
  type OrgScopedRoute,
} from '../../../../test/isolation/index.js'

const membersUrl = (orgId: string, path = '') => `/api/v1/orgs/${orgId}/members${path}`

const createTeam = async (setup: TwoOrgSetup, name: string, memberUserIds: string[]) =>
  expectData(
    await request(setup.app, 'POST', `/api/v1/orgs/${setup.a.id}/teams`, {
      headers: setup.sessionOf(setup.a.members.olivia),
      payload: { name, memberUserIds },
    }),
    201,
    teamDtoSchema,
  )

describe('GET /orgs/:orgId/members', () => {
  it('lists members newest first with profile, teams and sign-in method', async () => {
    const setup = await setupTwoOrgs()
    const { olivia, adam, uma } = setup.a.members
    const team = await createTeam(setup, 'Research', [uma.id])
    const page = expectPage(
      await request(setup.app, 'GET', membersUrl(setup.a.id), { headers: setup.sessionOf(adam) }),
      memberDtoSchema,
    )
    expect(page.data.map((m) => m.user.id)).toEqual([uma.id, adam.id, olivia.id])
    expect(page.data[0]).toMatchObject({
      role: 'user',
      status: 'active',
      primaryTeamId: team.id,
      teams: [{ id: team.id, name: 'Research' }],
      signInMethod: { type: 'password', providerId: null },
      twoFactorEnabled: false,
      user: { email: uma.email },
    })
  })

  it('filters by role, status, team and search, and pages by name', async () => {
    const setup = await setupTwoOrgs()
    const { adam, uma } = setup.a.members
    const team = await createTeam(setup, 'Research', [uma.id])
    const headers = setup.sessionOf(adam)
    const ids = async (query: Record<string, string>) =>
      expectPage(
        await request(setup.app, 'GET', membersUrl(setup.a.id), { headers, query }),
        memberDtoSchema,
      ).data.map((m) => m.user.id)
    expect(await ids({ role: 'admin' })).toEqual([adam.id])
    expect(await ids({ teamId: team.id })).toEqual([uma.id])
    expect(await ids({ q: uma.email })).toEqual([uma.id])
    expect(await ids({ status: 'deactivated' })).toEqual([])
    const first = expectPage(
      await request(setup.app, 'GET', membersUrl(setup.a.id), {
        headers,
        query: { sort: 'name', limit: '2' },
      }),
      memberDtoSchema,
    )
    const rest = expectPage(
      await request(setup.app, 'GET', membersUrl(setup.a.id), {
        headers,
        query: { sort: 'name', limit: '2', cursor: first.nextCursor ?? '' },
      }),
      memberDtoSchema,
    )
    expect([...first.data, ...rest.data].map((m) => m.user.name)).toEqual(['adam', 'olivia', 'uma'])
  })

  it('is for Admins: a User gets 403', async () => {
    const setup = await setupTwoOrgs()
    expectError(
      await request(setup.app, 'GET', membersUrl(setup.a.id), {
        headers: setup.sessionOf(setup.a.members.uma),
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })
})

describe('PATCH /orgs/:orgId/members/:memberId', () => {
  it('changes the role and primary team (one of the member’s teams)', async () => {
    const setup = await setupTwoOrgs()
    const { adam, uma } = setup.a.members
    const first = await createTeam(setup, 'First', [uma.id])
    const second = await createTeam(setup, 'Second', [uma.id])
    const outside = await createTeam(setup, 'Outside', [])
    const headers = setup.sessionOf(adam)
    const url = membersUrl(setup.a.id, `/${uma.memberId}`)
    const updated = expectData(
      await request(setup.app, 'PATCH', url, {
        headers,
        payload: { role: 'builder', primaryTeamId: second.id },
      }),
      200,
      memberDtoSchema,
    )
    expect(updated).toMatchObject({ role: 'builder', primaryTeamId: second.id })
    expect(first.id).not.toBe(second.id)
    expectError(
      await request(setup.app, 'PATCH', url, { headers, payload: { primaryTeamId: outside.id } }),
      422,
      ERROR_CODES.MEMBERS_PRIMARY_TEAM_NOT_A_MEMBER,
    )
  })

  it('lets only Owners make or change Owners, and never removes the last one', async () => {
    const setup = await setupTwoOrgs()
    const { olivia, adam, uma } = setup.a.members
    expectError(
      await request(setup.app, 'PATCH', membersUrl(setup.a.id, `/${uma.memberId}`), {
        headers: setup.sessionOf(adam),
        payload: { role: 'owner' },
      }),
      403,
      ERROR_CODES.MEMBERS_OWNER_ROLE_RESTRICTED,
    )
    expectError(
      await request(setup.app, 'PATCH', membersUrl(setup.a.id, `/${olivia.memberId}`), {
        headers: setup.sessionOf(adam),
        payload: { role: 'admin' },
      }),
      403,
      ERROR_CODES.MEMBERS_OWNER_ROLE_RESTRICTED,
    )
    expectError(
      await request(setup.app, 'PATCH', membersUrl(setup.a.id, `/${olivia.memberId}`), {
        headers: setup.sessionOf(olivia),
        payload: { role: 'admin' },
      }),
      409,
      ERROR_CODES.MEMBERS_LAST_OWNER,
    )
    // With a second Owner the first may step down.
    expectData(
      await request(setup.app, 'PATCH', membersUrl(setup.a.id, `/${uma.memberId}`), {
        headers: setup.sessionOf(olivia),
        payload: { role: 'owner' },
      }),
      200,
      memberDtoSchema,
    )
    const demoted = expectData(
      await request(setup.app, 'PATCH', membersUrl(setup.a.id, `/${olivia.memberId}`), {
        headers: setup.sessionOf(olivia),
        payload: { role: 'admin' },
      }),
      200,
      memberDtoSchema,
    )
    expect(demoted.role).toBe('admin')
  })

  it('answers 404 for an unknown member', async () => {
    const setup = await setupTwoOrgs()
    expectError(
      await request(
        setup.app,
        'PATCH',
        membersUrl(setup.a.id, `/${setup.b.members.bea.memberId}`),
        {
          headers: setup.sessionOf(setup.a.members.adam),
          payload: { role: 'user' },
        },
      ),
      404,
      ERROR_CODES.MEMBER_NOT_FOUND,
    )
  })
})

describe('deactivate, reactivate and remove', () => {
  it('deactivates a member, who then loses access, and reactivates them with the same role', async () => {
    const setup = await setupTwoOrgs()
    const { adam, uma } = setup.a.members
    const headers = setup.sessionOf(adam)
    const deactivated = expectData(
      await request(setup.app, 'POST', membersUrl(setup.a.id, `/${uma.memberId}/deactivate`), {
        headers,
      }),
      200,
      memberDtoSchema,
    )
    expect(deactivated).toMatchObject({ status: 'deactivated', role: 'user' })
    expect(deactivated.deactivatedAt).not.toBeNull()
    expectError(
      await request(setup.app, 'GET', `/api/v1/orgs/${setup.a.id}`, {
        headers: setup.sessionOf(uma),
      }),
      404,
      ERROR_CODES.ORGANIZATION_NOT_FOUND,
    )
    const reactivated = expectData(
      await request(setup.app, 'POST', membersUrl(setup.a.id, `/${uma.memberId}/reactivate`), {
        headers,
      }),
      200,
      memberDtoSchema,
    )
    expect(reactivated).toMatchObject({ status: 'active', role: 'user', deactivatedAt: null })
  })

  it('refuses to deactivate or remove the last Owner', async () => {
    const setup = await setupTwoOrgs()
    const { olivia } = setup.a.members
    const headers = setup.sessionOf(olivia)
    expectError(
      await request(setup.app, 'POST', membersUrl(setup.a.id, `/${olivia.memberId}/deactivate`), {
        headers,
      }),
      409,
      ERROR_CODES.MEMBERS_LAST_OWNER,
    )
    expectError(
      await request(setup.app, 'DELETE', membersUrl(setup.a.id, `/${olivia.memberId}`), {
        headers,
      }),
      409,
      ERROR_CODES.MEMBERS_LAST_OWNER,
    )
  })

  it('removes a member with their team memberships and preferences, and clears their lead', async () => {
    const setup = await setupTwoOrgs()
    const { adam, uma } = setup.a.members
    const team = await createTeam(setup, 'Research', [uma.id])
    await request(setup.app, 'PATCH', `/api/v1/orgs/${setup.a.id}/teams/${team.id}`, {
      headers: setup.sessionOf(adam),
      payload: { leadUserId: uma.id },
    })
    await request(setup.app, 'PATCH', membersUrl(setup.a.id, '/me/preferences'), {
      headers: setup.sessionOf(uma),
      payload: { tableDensity: 'compact' },
    })
    expectError(
      await request(setup.app, 'DELETE', membersUrl(setup.a.id, `/${uma.memberId}`), {
        headers: setup.sessionOf(adam),
        query: { transferToUserId: setup.b.members.bea.id },
      }),
      422,
      ERROR_CODES.MEMBERS_TRANSFER_TARGET_INVALID,
    )
    expectNoContent(
      await request(setup.app, 'DELETE', membersUrl(setup.a.id, `/${uma.memberId}`), {
        headers: setup.sessionOf(adam),
        query: { transferToUserId: adam.id },
      }),
    )
    const left = await setup.db.tenant(setup.a.id, async (tx) => ({
      memberships: await tx.select().from(organizationMembers),
      preferences: await tx.select().from(memberPreferences),
    }))
    expect(left.memberships.map((m) => m.userId)).not.toContain(uma.id)
    expect(left.preferences).toEqual([])
    const after = expectData(
      await request(setup.app, 'GET', `/api/v1/orgs/${setup.a.id}/teams/${team.id}`, {
        headers: setup.sessionOf(adam),
      }),
      200,
      teamDtoSchema,
    )
    expect(after).toMatchObject({ memberCount: 0, leadUserId: null })
  })
})

describe('POST /orgs/:orgId/members/bulk', () => {
  it('applies the action to each member and skips the ones that cannot change, with a code', async () => {
    const setup = await setupTwoOrgs()
    const { olivia, adam, uma } = setup.a.members
    const extra = await addMember(setup.container, setup.a.id, 'user')
    const headers = setup.sessionOf(adam)
    const result = expectData(
      await request(setup.app, 'POST', membersUrl(setup.a.id, '/bulk'), {
        headers,
        payload: {
          action: 'change-role',
          memberIds: [uma.memberId, extra.memberId, olivia.memberId],
          role: 'builder',
        },
      }),
      200,
      bulkMemberActionResultDtoSchema,
    )
    expect(result).toEqual({
      affected: 2,
      skipped: [{ memberId: olivia.memberId, code: ERROR_CODES.MEMBERS_OWNER_ROLE_RESTRICTED }],
    })
    const team = await createTeam(setup, 'Research', [])
    const added = expectData(
      await request(setup.app, 'POST', membersUrl(setup.a.id, '/bulk'), {
        headers,
        payload: {
          action: 'add-to-team',
          memberIds: [uma.memberId, extra.memberId],
          teamId: team.id,
        },
      }),
      200,
      bulkMemberActionResultDtoSchema,
    )
    expect(added).toEqual({ affected: 2, skipped: [] })
    expectError(
      await request(setup.app, 'POST', membersUrl(setup.a.id, '/bulk'), {
        headers,
        payload: { action: 'add-to-team', memberIds: [uma.memberId], teamId: setup.b.id },
      }),
      404,
      ERROR_CODES.TEAM_NOT_FOUND,
    )
  })
})

describe('member preferences', () => {
  it('reads defaults, merges changes and keeps required emails on', async () => {
    const setup = await setupTwoOrgs()
    const headers = setup.sessionOf(setup.a.members.uma)
    const url = membersUrl(setup.a.id, '/me/preferences')
    const defaults = expectData(
      await request(setup.app, 'GET', url, { headers }),
      200,
      memberPreferencesDtoSchema,
    )
    expect(defaults).toMatchObject({
      defaultModelKey: null,
      checklistDismissed: false,
      tableDensity: 'comfortable',
    })
    expect(defaults.notifications['knowledge_source.ready']).toEqual({ inApp: true, email: false })
    const updated = expectData(
      await request(setup.app, 'PATCH', url, {
        headers,
        payload: {
          defaultModelKey: 'openai:gpt-5',
          notifications: {
            'knowledge_source.ready': { email: true },
            'approval.requested': { email: false, inApp: false },
          },
        },
      }),
      200,
      memberPreferencesDtoSchema,
    )
    expect(updated.defaultModelKey).toBe('openai:gpt-5')
    expect(updated.notifications['knowledge_source.ready']).toEqual({ inApp: true, email: true })
    expect(updated.notifications['approval.requested']).toEqual({ inApp: false, email: true })
    const again = expectData(
      await request(setup.app, 'PATCH', url, { headers, payload: { checklistDismissed: true } }),
      200,
      memberPreferencesDtoSchema,
    )
    expect(again).toMatchObject({ defaultModelKey: 'openai:gpt-5', checklistDismissed: true })
    expect(again.notifications['knowledge_source.ready']).toEqual({ inApp: true, email: true })
  })
})

describe('GET /me memberships', () => {
  it('lists the person’s active memberships through the members module', async () => {
    const setup = await setupTwoOrgs()
    const me = expectData(
      await request(setup.app, 'GET', '/api/v1/me', {
        headers: setup.sessionOf(setup.a.members.uma),
      }),
      200,
      meDtoSchema,
    )
    expect(me.memberships).toMatchObject([
      {
        organization: {
          id: setup.a.id,
          name: 'Acme Research',
          slug: setup.a.slug,
          logoUrl: null,
          status: 'active',
        },
        role: 'user',
        primaryTeamId: null,
      },
    ])
    expect(me.canCreateOrganization).toBe(false)
    // lastOrganizationId must be one of these organizations.
    expectError(
      await request(setup.app, 'PATCH', '/api/v1/me', {
        headers: setup.sessionOf(setup.a.members.uma),
        payload: { lastOrganizationId: setup.b.id },
      }),
      404,
      ERROR_CODES.ORGANIZATION_NOT_FOUND,
    )
  })
})

describe('tenant isolation', () => {
  const resourceRoutes: OrgScopedRoute[] = [
    { method: 'GET', path: '/orgs/:orgId/members/:memberId' },
    { method: 'PATCH', path: '/orgs/:orgId/members/:memberId', payload: { role: 'user' } },
    { method: 'DELETE', path: '/orgs/:orgId/members/:memberId' },
    { method: 'POST', path: '/orgs/:orgId/members/:memberId/deactivate' },
    { method: 'POST', path: '/orgs/:orgId/members/:memberId/reactivate' },
  ]
  const orgRoutes: OrgScopedRoute[] = [
    { method: 'GET', path: '/orgs/:orgId/members' },
    {
      method: 'POST',
      path: '/orgs/:orgId/members/bulk',
      payload: { action: 'deactivate', memberIds: ['00000000-0000-4000-8000-000000000000'] },
    },
    { method: 'GET', path: '/orgs/:orgId/members/me/preferences' },
    {
      method: 'PATCH',
      path: '/orgs/:orgId/members/me/preferences',
      payload: { tableDensity: 'compact' },
    },
  ]

  it.each(resourceRoutes)("keeps A's member out of reach on $method $path", async (route) => {
    const setup = await setupTwoOrgs()
    const { uma } = setup.a.members
    await expect(
      assertRouteIsolation(
        setup.app,
        route,
        setup.subjects({ memberId: uma.memberId }, [uma.memberId, uma.id, uma.email]),
      ),
    ).resolves.toBeUndefined()
  })

  it.each(orgRoutes)("answers 404 ORGANIZATION_NOT_FOUND on A's $method $path", async (route) => {
    const setup = await setupTwoOrgs()
    const { uma } = setup.a.members
    const subjects = setup.subjects({}, [uma.memberId, uma.id, uma.email, 'Acme Research'])
    const cases = crossTenantCases(route, subjects).filter((c) => c.expected.code !== undefined)
    for (const testCase of cases) {
      expect(await checkCrossTenantCase(setup.app, testCase, subjects.orgA.markers)).toEqual([])
    }
  })

  it('shows a person only their own memberships under db.user (tenant+self)', async () => {
    const setup = await setupTwoOrgs()
    const { db } = getTestDatabase()
    const rows = await db.user(setup.a.members.uma.id, (tx) =>
      tx.select({ userId: organizationMembers.userId }).from(organizationMembers),
    )
    expect(rows).toEqual([{ userId: setup.a.members.uma.id }])
    await expect(
      db.user(setup.a.members.uma.id, (tx) =>
        tx.execute(sql`update organization_members set role = 'owner'`),
      ),
    ).resolves.toMatchObject({ rowCount: 0 })
  })

  it('holds at the database layer for memberships and preferences (tenant policy, FORCE RLS)', async () => {
    const setup = await setupTwoOrgs()
    const orgs = { a: setup.a.id, b: setup.b.id }
    const extra = { a: '', b: '' }
    for (const key of ['a', 'b'] as const) {
      const user = await addMember(setup.container, orgs[key], 'user')
      await setup.db.tenant(orgs[key], (tx) =>
        tx.execute(sql`delete from organization_members where user_id = ${user.id}`),
      )
      extra[key] = user.id
    }
    await expect(
      assertTenantIsolation(
        setup.db,
        {
          table: organizationMembers,
          organizationId: organizationMembers.organizationId,
          row: (orgId) => ({
            organizationId: orgId,
            userId: orgId === orgs.a ? extra.a : extra.b,
            role: 'user' as const,
            provisioningSource: 'invitation' as const,
          }),
        },
        orgs,
      ),
    ).resolves.toBeUndefined()
    await expect(
      assertTenantIsolation(
        setup.db,
        {
          table: memberPreferences,
          organizationId: memberPreferences.organizationId,
          row: (orgId) => ({
            organizationId: orgId,
            userId: orgId === orgs.a ? setup.a.members.uma.id : setup.b.members.bea.id,
          }),
        },
        orgs,
      ),
    ).resolves.toBeUndefined()
    await expect(
      assertTenantIsolation(
        setup.db,
        {
          table: invitations,
          organizationId: invitations.organizationId,
          row: (orgId) => ({
            organizationId: orgId,
            email: `probe-${orgId.slice(0, 8)}@example.test`,
            role: 'user' as const,
            tokenHash: createHash('sha256').update(orgId).digest(),
          }),
        },
        orgs,
      ),
    ).resolves.toBeUndefined()
  })
})
