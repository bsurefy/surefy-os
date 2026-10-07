// SPDX-License-Identifier: AGPL-3.0-only
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { organizationMembers, organizations, teamMembers, teams } from '@/database/tables/index.js'
import {
  addTeamMembersResultDtoSchema,
  ERROR_CODES,
  teamDeletionImpactDtoSchema,
  teamDtoSchema,
  teamMemberDtoSchema,
} from '@surefy/contracts'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import {
  expectData,
  expectError,
  expectNoContent,
  expectPage,
  request,
} from '../../../../test/helpers/request.js'
import {
  assertRouteIsolation,
  assertTenantIsolation,
  type OrgScopedRoute,
} from '../../../../test/isolation/index.js'

const teamsUrl = (orgId: string, path = '') => `/api/v1/orgs/${orgId}/teams${path}`

const accessVersion = async (setup: TwoOrgSetup, orgId: string) => {
  const [row] = await setup.db.tenant(orgId, (tx) =>
    tx
      .select({ v: organizations.accessVersion })
      .from(organizations)
      .where(eq(organizations.id, orgId)),
  )
  return row?.v
}

const primaryTeamOf = async (setup: TwoOrgSetup, orgId: string, userId: string) => {
  const [row] = await setup.db.tenant(orgId, (tx) =>
    tx
      .select({ primaryTeamId: organizationMembers.primaryTeamId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId)),
  )
  return row?.primaryTeamId
}

const createTeam = async (setup: TwoOrgSetup, payload: Record<string, unknown>) =>
  expectData(
    await request(setup.app, 'POST', teamsUrl(setup.a.id), {
      headers: setup.sessionOf(setup.a.members.adam),
      payload,
    }),
    201,
    teamDtoSchema,
  )

describe('teams CRUD', () => {
  it('creates a team with members and a lead, counts them and bumps the access version', async () => {
    const setup = await setupTwoOrgs()
    const { uma, adam } = setup.a.members
    const before = await accessVersion(setup, setup.a.id)
    const team = await createTeam(setup, {
      name: 'Research',
      description: 'Lab work',
      leadUserId: uma.id,
      memberUserIds: [uma.id, adam.id],
    })
    expect(team).toMatchObject({
      name: 'Research',
      description: 'Lab work',
      leadUserId: uma.id,
      memberCount: 2,
      primaryMemberCount: 2, // their first team becomes their primary team
    })
    expect(await accessVersion(setup, setup.a.id)).toBe((before ?? 0) + 1)
    expect(await primaryTeamOf(setup, setup.a.id, uma.id)).toBe(team.id)
  })

  it('refuses a duplicate name (case-insensitive), a lead outside the team and non-members', async () => {
    const setup = await setupTwoOrgs()
    await createTeam(setup, { name: 'Research' })
    const headers = setup.sessionOf(setup.a.members.adam)
    const post = (payload: unknown) =>
      request(setup.app, 'POST', teamsUrl(setup.a.id), { headers, payload })
    expectError(await post({ name: 'research' }), 409, ERROR_CODES.TEAM_NAME_TAKEN)
    expectError(
      await post({ name: 'Ops', leadUserId: setup.a.members.uma.id }),
      422,
      ERROR_CODES.TEAM_LEAD_NOT_A_MEMBER,
    )
    expectError(
      await post({ name: 'Ops', memberUserIds: [setup.b.members.bea.id] }),
      404,
      ERROR_CODES.MEMBER_NOT_FOUND,
    )
    expectError(await post({ name: '' }), 422, ERROR_CODES.VALIDATION_FAILED)
  })

  it('lists teams by name with a cursor, renames and changes the lead', async () => {
    const setup = await setupTwoOrgs()
    const { uma } = setup.a.members
    const zeta = await createTeam(setup, { name: 'Zeta', memberUserIds: [uma.id] })
    await createTeam(setup, { name: 'alpha' })
    await createTeam(setup, { name: 'Beta' })
    const headers = setup.sessionOf(setup.a.members.adam)
    const page1 = expectPage(
      await request(setup.app, 'GET', teamsUrl(setup.a.id), { headers, query: { limit: '2' } }),
      teamDtoSchema,
    )
    expect(page1.data.map((t) => t.name)).toEqual(['alpha', 'Beta'])
    const page2 = expectPage(
      await request(setup.app, 'GET', teamsUrl(setup.a.id), {
        headers,
        query: { limit: '2', cursor: page1.nextCursor ?? '' },
      }),
      teamDtoSchema,
    )
    expect(page2.data.map((t) => t.name)).toEqual(['Zeta'])
    expect(page2.nextCursor).toBeNull()

    const renamed = expectData(
      await request(setup.app, 'PATCH', teamsUrl(setup.a.id, `/${zeta.id}`), {
        headers,
        payload: { name: 'Omega', leadUserId: uma.id },
      }),
      200,
      teamDtoSchema,
    )
    expect(renamed).toMatchObject({ name: 'Omega', leadUserId: uma.id })
    expectError(
      await request(setup.app, 'PATCH', teamsUrl(setup.a.id, `/${zeta.id}`), {
        headers,
        payload: { name: 'BETA' },
      }),
      409,
      ERROR_CODES.TEAM_NAME_TAKEN,
    )
  })

  it('is read and managed by Admins only', async () => {
    const setup = await setupTwoOrgs()
    expectError(
      await request(setup.app, 'GET', teamsUrl(setup.a.id), {
        headers: setup.sessionOf(setup.a.members.uma),
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })

  it('deletes a team after showing its impact, clearing the primary team of its members', async () => {
    const setup = await setupTwoOrgs()
    const { uma } = setup.a.members
    const team = await createTeam(setup, { name: 'Research', memberUserIds: [uma.id] })
    const headers = setup.sessionOf(setup.a.members.adam)
    const impact = expectData(
      await request(setup.app, 'GET', teamsUrl(setup.a.id, `/${team.id}/deletion-impact`), {
        headers,
      }),
      200,
      teamDeletionImpactDtoSchema,
    )
    expect(impact).toEqual({
      memberCount: 1,
      primaryMemberCount: 1,
      connectionCount: 0,
      dependents: [],
    })
    expectNoContent(
      await request(setup.app, 'DELETE', teamsUrl(setup.a.id, `/${team.id}`), { headers }),
    )
    expect(await primaryTeamOf(setup, setup.a.id, uma.id)).toBeNull()
    expectError(
      await request(setup.app, 'GET', teamsUrl(setup.a.id, `/${team.id}`), { headers }),
      404,
      ERROR_CODES.TEAM_NOT_FOUND,
    )
  })
})

describe('team members', () => {
  it('adds members once, lists them with role, lead and primary badges', async () => {
    const setup = await setupTwoOrgs()
    const { uma, adam } = setup.a.members
    const team = await createTeam(setup, {
      name: 'Research',
      memberUserIds: [uma.id],
      leadUserId: uma.id,
    })
    const headers = setup.sessionOf(adam)
    const added = expectData(
      await request(setup.app, 'POST', teamsUrl(setup.a.id, `/${team.id}/members`), {
        headers,
        payload: { userIds: [uma.id, adam.id] },
      }),
      200,
      addTeamMembersResultDtoSchema,
    )
    expect(added).toEqual({ added: 1 })
    const page = expectPage(
      await request(setup.app, 'GET', teamsUrl(setup.a.id, `/${team.id}/members`), { headers }),
      teamMemberDtoSchema,
    )
    expect(page.data.map((m) => [m.user.id, m.role, m.isLead, m.isPrimary])).toEqual([
      [uma.id, 'user', true, true],
      [adam.id, 'admin', false, true],
    ])
  })

  it('moves the primary team to the earliest remaining team and clears the lead on leaving', async () => {
    const setup = await setupTwoOrgs()
    const { uma } = setup.a.members
    const first = await createTeam(setup, {
      name: 'First',
      memberUserIds: [uma.id],
      leadUserId: uma.id,
    })
    const second = await createTeam(setup, { name: 'Second', memberUserIds: [uma.id] })
    expect(await primaryTeamOf(setup, setup.a.id, uma.id)).toBe(first.id)
    const headers = setup.sessionOf(setup.a.members.adam)
    expectNoContent(
      await request(setup.app, 'DELETE', teamsUrl(setup.a.id, `/${first.id}/members/${uma.id}`), {
        headers,
      }),
    )
    expect(await primaryTeamOf(setup, setup.a.id, uma.id)).toBe(second.id)
    const team = expectData(
      await request(setup.app, 'GET', teamsUrl(setup.a.id, `/${first.id}`), { headers }),
      200,
      teamDtoSchema,
    )
    expect(team.leadUserId).toBeNull()
    expectNoContent(
      await request(setup.app, 'DELETE', teamsUrl(setup.a.id, `/${second.id}/members/${uma.id}`), {
        headers,
      }),
    )
    expect(await primaryTeamOf(setup, setup.a.id, uma.id)).toBeNull()
    expectError(
      await request(setup.app, 'DELETE', teamsUrl(setup.a.id, `/${second.id}/members/${uma.id}`), {
        headers,
      }),
      404,
      ERROR_CODES.TEAM_MEMBER_NOT_FOUND,
    )
  })
})

describe('tenant isolation', () => {
  const routes: OrgScopedRoute[] = [
    { method: 'GET', path: '/orgs/:orgId/teams/:teamId' },
    { method: 'PATCH', path: '/orgs/:orgId/teams/:teamId', payload: { name: 'Mine' } },
    { method: 'DELETE', path: '/orgs/:orgId/teams/:teamId' },
    { method: 'GET', path: '/orgs/:orgId/teams/:teamId/deletion-impact' },
    { method: 'GET', path: '/orgs/:orgId/teams/:teamId/members' },
    { method: 'POST', path: '/orgs/:orgId/teams/:teamId/members', payload: { userIds: [] } },
    { method: 'DELETE', path: '/orgs/:orgId/teams/:teamId/members/:userId' },
  ]

  it.each(routes)("keeps A's team out of reach on $method $path", async (route) => {
    const setup = await setupTwoOrgs()
    const { uma } = setup.a.members
    const team = await createTeam(setup, { name: 'Secret Lab', memberUserIds: [uma.id] })
    const payload =
      route.path.endsWith('/members') && route.method === 'POST'
        ? { userIds: [setup.b.members.bea.id] }
        : route.payload
    await expect(
      assertRouteIsolation(
        setup.app,
        { ...route, ...(payload === undefined ? {} : { payload }) },
        setup.subjects({ teamId: team.id, userId: uma.id }, [team.id, 'Secret Lab', uma.email]),
      ),
    ).resolves.toBeUndefined()
  })

  it("never lists A's teams to B (list and create routes)", async () => {
    const setup = await setupTwoOrgs()
    const team = await createTeam(setup, { name: 'Secret Lab' })
    const own = await request(setup.app, 'GET', teamsUrl(setup.b.id), {
      headers: setup.sessionOf(setup.b.members.bea),
    })
    expect(own.statusCode).toBe(200)
    expect(own.body).not.toContain(team.id)
    for (const method of ['GET', 'POST'] as const) {
      expectError(
        await request(setup.app, method, teamsUrl(setup.a.id), {
          headers: setup.sessionOf(setup.b.members.bea),
          ...(method === 'POST' ? { payload: { name: 'Intruders' } } : {}),
        }),
        404,
        ERROR_CODES.ORGANIZATION_NOT_FOUND,
      )
    }
  })

  it('holds at the database layer (tenant policy, FORCE RLS)', async () => {
    const setup = await setupTwoOrgs()
    const orgs = { a: setup.a.id, b: setup.b.id }
    await expect(
      assertTenantIsolation(
        setup.db,
        {
          table: teams,
          organizationId: teams.organizationId,
          row: (orgId) => ({ organizationId: orgId, name: `Team ${orgId.slice(0, 8)}` }),
        },
        orgs,
      ),
    ).resolves.toBeUndefined()
    const teamOf = new Map<string, string>()
    for (const orgId of [orgs.a, orgs.b]) {
      const [row] = await setup.db.tenant(orgId, (tx) =>
        tx.insert(teams).values({ organizationId: orgId, name: 'Members probe' }).returning(),
      )
      teamOf.set(orgId, row?.id ?? '')
    }
    const memberOf = new Map([
      [orgs.a, setup.a.members.uma.id],
      [orgs.b, setup.b.members.bea.id],
    ])
    await expect(
      assertTenantIsolation(
        setup.db,
        {
          table: teamMembers,
          organizationId: teamMembers.organizationId,
          row: (orgId) => ({
            organizationId: orgId,
            teamId: teamOf.get(orgId) ?? '',
            userId: memberOf.get(orgId) ?? '',
          }),
        },
        orgs,
      ),
    ).resolves.toBeUndefined()
  })
})
