// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { ForbiddenError } from '@/core/errors/index.js'
import { auditLogs, organizations, users } from '@/database/tables/index.js'
import {
  accessPolicyDtoSchema,
  effectiveAccessDtoSchema,
  ERROR_CODES,
  memberEffectiveAccessDtoSchema,
  PERMISSIONS,
  teamDtoSchema,
  teamEffectiveAccessDtoSchema,
} from '@surefy/contracts'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectError, request } from '../../../../test/helpers/request.js'

const orgUrl = (orgId: string, path = '') => `/api/v1/orgs/${orgId}${path}`

const myAccess = async (setup: TwoOrgSetup, member: TwoOrgSetup['a']['members']['uma']) =>
  expectData(
    await request(setup.app, 'GET', orgUrl(setup.a.id, '/access/me'), {
      headers: setup.sessionOf(member),
    }),
    200,
    effectiveAccessDtoSchema,
  )

const putPolicy = (setup: TwoOrgSetup, path: string, payload: unknown) =>
  request(setup.app, 'PUT', orgUrl(setup.a.id, path), {
    headers: setup.sessionOf(setup.a.members.adam),
    payload,
  })

const setOrgStatus = (setup: TwoOrgSetup, status: 'suspended' | 'deletion_scheduled') =>
  setup.db.system('test', (tx) =>
    tx
      .update(organizations)
      .set({
        status,
        ...(status === 'deletion_scheduled'
          ? { deletionRequestedAt: new Date(), deletionScheduledFor: new Date() }
          : { suspendedAt: new Date() }),
      })
      .where(eq(organizations.id, setup.a.id)),
  )

describe('GET /orgs/:orgId/access/me', () => {
  it('returns the role, the role permissions and the Community entitlements', async () => {
    const setup = await setupTwoOrgs()
    const owner = await myAccess(setup, setup.a.members.olivia)
    expect(owner).toMatchObject({ role: 'owner', teamIds: [], features: [], license: null })
    expect(owner.permissions).toContain(PERMISSIONS.DATA_CONTROL_DELETE)
    expect(owner.reasons).toContainEqual({ key: 'feature:sso', source: 'community' })
    const user = await myAccess(setup, setup.a.members.uma)
    expect(user.permissions).toContain(PERMISSIONS.ACCESS_READ_SELF)
    expect(user.permissions).not.toContain(PERMISSIONS.ACCESS_READ)
  })

  it('applies the organization rules: suspended, deletion scheduled, two-factor required', async () => {
    const setup = await setupTwoOrgs()
    const get = (member: TwoOrgSetup['a']['members']['uma']) =>
      request(setup.app, 'GET', orgUrl(setup.a.id, '/access/me'), {
        headers: setup.sessionOf(member),
      })
    await setOrgStatus(setup, 'deletion_scheduled')
    expectError(await get(setup.a.members.uma), 404, ERROR_CODES.ORGANIZATION_NOT_FOUND)
    expectData(await get(setup.a.members.adam), 200, effectiveAccessDtoSchema)
    await setOrgStatus(setup, 'suspended')
    expectError(await get(setup.a.members.adam), 403, ERROR_CODES.ORGANIZATION_SUSPENDED)
    await setup.db.system('test', (tx) =>
      tx
        .update(organizations)
        .set({ status: 'active', settings: { version: 1, security: { require2fa: true } } })
        .where(eq(organizations.id, setup.a.id)),
    )
    expectError(await get(setup.a.members.adam), 403, ERROR_CODES.AUTH_TWO_FACTOR_REQUIRED)
    await setup.db.global
      .update(users)
      .set({ twoFactorEnabled: true })
      .where(eq(users.id, setup.a.members.adam.id))
    expectData(await get(setup.a.members.adam), 200, effectiveAccessDtoSchema)
  })

  it('runs the access checks extensions add after the tenant is known', async () => {
    const setup = await setupTwoOrgs()
    setup.container.hooks.addAccessCheck({
      name: 'test-block-uma',
      check: ({ actor }) =>
        actor.userId === setup.a.members.uma.id
          ? Promise.reject(new ForbiddenError(ERROR_CODES.ACCESS_FORBIDDEN, 'Blocked'))
          : Promise.resolve(),
    })
    expectError(
      await request(setup.app, 'GET', orgUrl(setup.a.id, '/access/me'), {
        headers: setup.sessionOf(setup.a.members.uma),
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    await myAccess(setup, setup.a.members.adam)
  })
})

describe('access policies', () => {
  it('narrows modules for everyone at once, audits the change and drops gated permissions', async () => {
    const setup = await setupTwoOrgs()
    const before = await myAccess(setup, setup.a.members.adam)
    expect(before.permissions).toContain(PERMISSIONS.AUDIT_READ)
    const saved = expectData(
      await putPolicy(setup, '/access/policy', { version: 1, modules: ['chat', 'knowledge'] }),
      200,
      accessPolicyDtoSchema,
    )
    expect(saved).toMatchObject({ teamId: null, updatedByUserId: setup.a.members.adam.id })
    const after = await myAccess(setup, setup.a.members.adam)
    expect(after.modules).toEqual(['chat', 'knowledge'])
    expect(after.permissions).not.toContain(PERMISSIONS.AUDIT_READ)
    expect(after.reasons).toContainEqual({ key: 'module:guard', source: 'organization' })
    expectError(
      await request(setup.app, 'GET', orgUrl(setup.a.id, '/audit/entries'), {
        headers: setup.sessionOf(setup.a.members.adam),
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    const entries = await setup.db.system('test', (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, setup.a.id),
            eq(auditLogs.action, 'access_policy.updated'),
          ),
        ),
    )
    expect(entries).toHaveLength(1)
    expect(entries[0]?.metadata.changes).toEqual([
      { field: 'modules', from: null, to: ['chat', 'knowledge'] },
    ])
  })

  it('validates a team policy against the organization level and applies the team level', async () => {
    const setup = await setupTwoOrgs()
    const { uma } = setup.a.members
    const team = expectData(
      await request(setup.app, 'POST', orgUrl(setup.a.id, '/teams'), {
        headers: setup.sessionOf(setup.a.members.adam),
        payload: { name: 'Lab', memberUserIds: [uma.id] },
      }),
      201,
      teamDtoSchema,
    )
    await putPolicy(setup, '/access/policy', { version: 1, modules: ['chat', 'knowledge'] })
    const refused = expectError(
      await putPolicy(setup, `/teams/${team.id}/access-policy`, {
        version: 1,
        modules: ['chat', 'agents'],
      }),
      422,
      ERROR_CODES.ACCESS_EXCEEDS_PARENT,
    )
    expect(refused.details).toEqual([
      { field: 'modules', parentValue: ['chat', 'knowledge'], parentSource: 'organization' },
    ])
    expectData(
      await putPolicy(setup, `/teams/${team.id}/access-policy`, {
        version: 1,
        modules: ['chat'],
        limits: { maxAgents: 3 },
      }),
      200,
      accessPolicyDtoSchema,
    )
    const access = await myAccess(setup, uma)
    expect(access).toMatchObject({ modules: ['chat'], teamIds: [team.id], primaryTeamId: team.id })
    expect(access.limits.maxAgents).toBe(3)
    expect(access.reasons).toContainEqual({
      key: 'module:knowledge',
      source: 'team',
      teamId: team.id,
    })

    const headers = setup.sessionOf(setup.a.members.adam)
    const teamAccess = expectData(
      await request(setup.app, 'GET', orgUrl(setup.a.id, `/access/teams/${team.id}`), { headers }),
      200,
      teamEffectiveAccessDtoSchema,
    )
    expect(teamAccess).toMatchObject({ team: { id: team.id, name: 'Lab' }, modules: ['chat'] })
    const member = expectData(
      await request(setup.app, 'GET', orgUrl(setup.a.id, `/access/members/${uma.id}`), {
        headers,
      }),
      200,
      memberEffectiveAccessDtoSchema,
    )
    expect(member).toMatchObject({ user: { id: uma.id }, teams: [{ id: team.id }], role: 'user' })
    const policy = expectData(
      await request(setup.app, 'GET', orgUrl(setup.a.id, `/teams/${team.id}/access-policy`), {
        headers,
      }),
      200,
      accessPolicyDtoSchema,
    )
    expect(policy.policy).toEqual({ version: 1, modules: ['chat'], limits: { maxAgents: 3 } })
  })

  it('refuses a User, unknown teams and members of another organization', async () => {
    const setup = await setupTwoOrgs()
    const headers = setup.sessionOf(setup.a.members.adam)
    expectError(
      await request(setup.app, 'PUT', orgUrl(setup.a.id, '/access/policy'), {
        headers: setup.sessionOf(setup.a.members.uma),
        payload: { version: 1 },
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await request(
        setup.app,
        'GET',
        orgUrl(setup.a.id, `/access/teams/${setup.a.members.uma.id}`),
        { headers },
      ),
      404,
      ERROR_CODES.TEAM_NOT_FOUND,
    )
    expectError(
      await request(
        setup.app,
        'GET',
        orgUrl(setup.a.id, `/access/members/${setup.b.members.bea.id}`),
        { headers },
      ),
      404,
      ERROR_CODES.MEMBER_NOT_FOUND,
    )
    const empty = expectData(
      await request(setup.app, 'GET', orgUrl(setup.a.id, '/access/policy'), { headers }),
      200,
      accessPolicyDtoSchema,
    )
    expect(empty).toEqual({
      teamId: null,
      policy: { version: 1 },
      updatedByUserId: null,
      updatedAt: null,
    })
  })
})
