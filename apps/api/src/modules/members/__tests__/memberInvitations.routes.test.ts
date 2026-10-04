// SPDX-License-Identifier: AGPL-3.0-only
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { QUEUES } from '@/constants/queues.js'
import {
  invitations,
  invitationTeams,
  notifications,
  teams,
  users,
} from '@/database/tables/index.js'
import {
  acceptInvitationResultDtoSchema,
  ERROR_CODES,
  invitationDtoSchema,
  invitationLinkDtoSchema,
  invitationPreviewDtoSchema,
  memberDtoSchema,
  teamDtoSchema,
} from '@surefy/contracts'

import { createTestUser, testPassword } from '../../../../test/factories/index.js'
import { authHeaders, TEST_APP_ORIGIN } from '../../../../test/helpers/auth.js'
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
  checkCrossTenantCase,
  crossTenantCases,
  type OrgScopedRoute,
} from '../../../../test/isolation/index.js'

import type { SendEmailPayload } from '@/modules/notifications/index.js'

const invitationsUrl = (orgId: string, path = '') => `/api/v1/orgs/${orgId}/invitations${path}`

/** The invitation emails waiting on the `email` queue, oldest first. */
const queuedInvitations = async (setup: TwoOrgSetup) => {
  const jobs = await setup.container.queues.get(QUEUES.EMAIL).getJobs(['waiting', 'delayed'])
  return jobs
    .map((job) => job.data as SendEmailPayload)
    .filter((payload) => payload.template === 'invitation')
}

const tokenOf = (url: string): string => url.split('/invite/')[1] ?? ''

const invite = async (
  setup: TwoOrgSetup,
  payload: { email: string; role?: string; teamIds?: string[] },
) =>
  expectData(
    await request(setup.app, 'POST', invitationsUrl(setup.a.id), {
      headers: setup.sessionOf(setup.a.members.adam),
      payload: { role: 'user', ...payload },
    }),
    201,
    invitationDtoSchema,
  )

/** Invites the address and returns the invitation with the link token from its email. */
const inviteWithToken = async (setup: TwoOrgSetup, email: string, teamIds: string[] = []) => {
  const invitation = await invite(setup, { email, teamIds })
  const emails = await queuedInvitations(setup)
  const sent = emails.findLast((payload) => payload.to === email.toLowerCase())
  if (sent?.template !== 'invitation') throw new Error('no invitation email queued')
  return { invitation, token: tokenOf(sent.url), email: sent }
}

const createTeam = async (setup: TwoOrgSetup, name: string) =>
  expectData(
    await request(setup.app, 'POST', `/api/v1/orgs/${setup.a.id}/teams`, {
      headers: setup.sessionOf(setup.a.members.adam),
      payload: { name },
    }),
    201,
    teamDtoSchema,
  )

describe('POST /orgs/:orgId/invitations', () => {
  it('stores the invitation with its teams and queues the email with the link', async () => {
    const setup = await setupTwoOrgs()
    const team = await createTeam(setup, 'Research')
    const { invitation, token, email } = await inviteWithToken(setup, 'New.Person@Example.test', [
      team.id,
    ])
    expect(invitation).toMatchObject({
      email: 'new.person@example.test',
      role: 'user',
      status: 'pending',
      deliveryStatus: 'queued',
      teams: [{ id: team.id, name: 'Research' }],
      invitedBy: { userId: setup.a.members.adam.id, name: 'adam' },
      sendCount: 1,
    })
    expect(token).toMatch(/^[A-Za-z0-9]{43}$/)
    expect(email).toMatchObject({
      template: 'invitation',
      to: 'new.person@example.test',
      locale: 'en',
      orgId: setup.a.id,
      invitationId: invitation.id,
      organizationName: 'Acme Research',
      inviterName: 'adam',
    })
    expect(email.url).toBe(`${TEST_APP_ORIGIN}/invite/${token}`)
    // Only the hash is stored.
    const [row] = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select({ hash: invitations.tokenHash }).from(invitations),
    )
    expect(row?.hash.toString('utf8')).not.toContain(token)
  })

  it('refuses members, pending addresses, Owner invitations from Admins and foreign teams', async () => {
    const setup = await setupTwoOrgs()
    await invite(setup, { email: 'pending@example.test' })
    const post = (payload: unknown) =>
      request(setup.app, 'POST', invitationsUrl(setup.a.id), {
        headers: setup.sessionOf(setup.a.members.adam),
        payload,
      })
    expectError(
      await post({ email: setup.a.members.uma.email, role: 'user' }),
      409,
      ERROR_CODES.MEMBERS_ALREADY_MEMBER,
    )
    expectError(
      await post({ email: 'pending@example.test', role: 'user' }),
      409,
      ERROR_CODES.MEMBERS_ALREADY_INVITED,
    )
    expectError(
      await post({ email: 'boss@example.test', role: 'owner' }),
      403,
      ERROR_CODES.MEMBERS_OWNER_ROLE_RESTRICTED,
    )
    expectError(
      await post({ email: 'x@example.test', role: 'user', teamIds: [setup.b.id] }),
      404,
      ERROR_CODES.TEAM_NOT_FOUND,
    )
    expectError(
      await request(setup.app, 'POST', invitationsUrl(setup.a.id), {
        headers: setup.sessionOf(setup.a.members.uma),
        payload: { email: 'x@example.test', role: 'user' },
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })

  it('invites the same address again once the previous invitation has expired', async () => {
    const setup = await setupTwoOrgs()
    const first = await invite(setup, { email: 'late@example.test' })
    await setup.db.tenant(setup.a.id, (tx) =>
      tx.execute(sql`update invitations set expires_at = now() - interval '1 minute'`),
    )
    const second = await invite(setup, { email: 'late@example.test' })
    expect(second.id).not.toBe(first.id)
    const all = expectPage(
      await request(setup.app, 'GET', invitationsUrl(setup.a.id), {
        headers: setup.sessionOf(setup.a.members.adam),
        query: { status: ['pending', 'expired'] as unknown as string },
      }),
      invitationDtoSchema,
    )
    expect(all.data.map((i) => [i.id, i.status])).toEqual([
      [second.id, 'pending'],
      [first.id, 'expired'],
    ])
  })
})

describe('resend, link and revoke', () => {
  it('rotates the token on resend and on copy link; the previous link stops working', async () => {
    const setup = await setupTwoOrgs()
    const headers = setup.sessionOf(setup.a.members.adam)
    const { invitation, token } = await inviteWithToken(setup, 'rotate@example.test')
    const resent = expectData(
      await request(setup.app, 'POST', invitationsUrl(setup.a.id, `/${invitation.id}/resend`), {
        headers,
      }),
      200,
      invitationDtoSchema,
    )
    expect(resent).toMatchObject({ sendCount: 2, deliveryStatus: 'queued' })
    expect(await queuedInvitations(setup)).toHaveLength(2)
    expectError(
      await request(setup.app, 'GET', `/api/v1/invitations/${token}`),
      404,
      ERROR_CODES.INVITATION_NOT_FOUND,
    )
    const link = expectData(
      await request(setup.app, 'POST', invitationsUrl(setup.a.id, `/${invitation.id}/link`), {
        headers,
      }),
      200,
      invitationLinkDtoSchema,
    )
    expectData(
      await request(setup.app, 'GET', `/api/v1/invitations/${tokenOf(link.url)}`),
      200,
      invitationPreviewDtoSchema,
    )
    expect(await queuedInvitations(setup)).toHaveLength(2) // copying the link sends nothing
  })

  it('revokes a pending invitation; its link then reads as revoked', async () => {
    const setup = await setupTwoOrgs()
    const headers = setup.sessionOf(setup.a.members.adam)
    const { invitation, token } = await inviteWithToken(setup, 'revoke@example.test')
    const revoked = expectData(
      await request(setup.app, 'POST', invitationsUrl(setup.a.id, `/${invitation.id}/revoke`), {
        headers,
      }),
      200,
      invitationDtoSchema,
    )
    expect(revoked.status).toBe('revoked')
    expectError(
      await request(setup.app, 'POST', invitationsUrl(setup.a.id, `/${invitation.id}/resend`), {
        headers,
      }),
      409,
      ERROR_CODES.INVITATION_REVOKED,
    )
    const preview = expectData(
      await request(setup.app, 'GET', `/api/v1/invitations/${token}`),
      200,
      invitationPreviewDtoSchema,
    )
    expect(preview.status).toBe('revoked')
  })
})

describe('the invitation link', () => {
  it('previews the organization and role without a session', async () => {
    const setup = await setupTwoOrgs()
    const { token } = await inviteWithToken(setup, 'preview@example.test')
    await request(setup.app, 'PATCH', `/api/v1/orgs/${setup.a.id}`, {
      headers: setup.sessionOf(setup.a.members.olivia),
      payload: { settings: { security: { require2fa: true } } },
    })
    const preview = expectData(
      await request(setup.app, 'GET', `/api/v1/invitations/${token}`),
      200,
      invitationPreviewDtoSchema,
    )
    expect(preview).toMatchObject({
      organization: { name: 'Acme Research', slug: setup.a.slug, logoUrl: null },
      role: 'user',
      email: 'preview@example.test',
      inviterName: 'adam',
      status: 'pending',
      requiresTwoFactor: true,
    })
    expectError(
      await request(setup.app, 'GET', `/api/v1/invitations/${'a'.repeat(43)}`),
      404,
      ERROR_CODES.INVITATION_NOT_FOUND,
    )
    expectError(
      await request(setup.app, 'GET', '/api/v1/invitations/short'),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })

  it('lets the invited address sign up although public sign-up is closed', async () => {
    const setup = await setupTwoOrgs()
    const signUp = (email: string) =>
      request(setup.app, 'POST', '/api/auth/sign-up/email', {
        headers: { host: new URL(TEST_APP_ORIGIN).host, origin: TEST_APP_ORIGIN },
        payload: { name: 'Newcomer', email, password: testPassword(901) },
      })
    // Better Auth answers a refused sign-up like an existing account: check the accounts.
    const exists = async (email: string) =>
      (await setup.db.global.select({ id: users.id }).from(users).where(eq(users.email, email)))
        .length > 0
    await signUp('stranger@example.test')
    expect(await exists('stranger@example.test')).toBe(false)
    await invite(setup, { email: 'invited@example.test' })
    await signUp('Invited@Example.test')
    expect(await exists('invited@example.test')).toBe(true)
  })

  it('accepts as the invited person: membership, teams, primary team and access', async () => {
    const setup = await setupTwoOrgs()
    const first = await createTeam(setup, 'First')
    const second = await createTeam(setup, 'Second')
    const { token } = await inviteWithToken(setup, 'joiner@example.test', [second.id, first.id])
    const joiner = await createTestUser(setup.container, { email: 'joiner@example.test' })
    const headers = await authHeaders(setup.app, joiner)
    const result = expectData(
      await request(setup.app, 'POST', `/api/v1/invitations/${token}/accept`, { headers }),
      200,
      acceptInvitationResultDtoSchema,
    )
    expect(result.organization).toMatchObject({ id: setup.a.id, name: 'Acme Research' })
    const member = expectData(
      await request(setup.app, 'GET', `/api/v1/orgs/${setup.a.id}/members/${result.memberId}`, {
        headers: setup.sessionOf(setup.a.members.adam),
      }),
      200,
      memberDtoSchema,
    )
    expect(member).toMatchObject({
      role: 'user',
      provisioningSource: 'invitation',
      invitedByUserId: setup.a.members.adam.id,
      primaryTeamId: second.id, // position 0 of the invitation
    })
    expect(new Set(member.teams.map((t) => t.id))).toEqual(new Set([first.id, second.id]))
    // The new member reaches the organization right away.
    expect(
      (await request(setup.app, 'GET', `/api/v1/orgs/${setup.a.id}`, { headers })).statusCode,
    ).toBe(200)
    expectError(
      await request(setup.app, 'POST', `/api/v1/invitations/${token}/accept`, { headers }),
      409,
      ERROR_CODES.INVITATION_ALREADY_ACCEPTED,
    )
  })

  it('refuses another account, an expired link and a signed-out request', async () => {
    const setup = await setupTwoOrgs()
    const { token } = await inviteWithToken(setup, 'someone@example.test')
    const accept = (headers?: Record<string, string>) =>
      request(setup.app, 'POST', `/api/v1/invitations/${token}/accept`, {
        ...(headers === undefined ? {} : { headers }),
      })
    expectError(await accept(), 401, ERROR_CODES.AUTH_UNAUTHENTICATED)
    expectError(
      await accept(setup.sessionOf(setup.b.members.bea)),
      403,
      ERROR_CODES.INVITATION_EMAIL_MISMATCH,
    )
    await setup.db.tenant(setup.a.id, (tx) =>
      tx.execute(sql`update invitations set expires_at = now() - interval '1 minute'`),
    )
    const someone = await createTestUser(setup.container, { email: 'someone@example.test' })
    expectError(
      await accept(await authHeaders(setup.app, someone)),
      409,
      ERROR_CODES.INVITATION_EXPIRED,
    )
  })

  it('notifies the inviter once when someone asks for a new invitation', async () => {
    const setup = await setupTwoOrgs()
    const { invitation, token } = await inviteWithToken(setup, 'expired@example.test')
    const ask = () => request(setup.app, 'POST', `/api/v1/invitations/${token}/request-reissue`)
    expectNoContent(await ask()) // still pending: nothing to ask for
    await setup.db.tenant(setup.a.id, (tx) =>
      tx.execute(sql`update invitations set expires_at = now() - interval '1 minute'`),
    )
    expectNoContent(await ask())
    expectNoContent(await ask())
    expectNoContent(
      await request(setup.app, 'POST', `/api/v1/invitations/${'b'.repeat(43)}/request-reissue`),
    )
    const rows = await setup.db.tenant(setup.a.id, (tx) => tx.select().from(notifications))
    expect(rows).toEqual([
      expect.objectContaining({
        userId: setup.a.members.adam.id,
        type: 'invitation.reissue_requested',
        targetType: 'invitation',
        targetId: invitation.id,
      }),
    ])
  })
})

describe('pending invitations of an address (definer functions)', () => {
  it('lists them only for a verified account, and only while they are pending', async () => {
    const setup = await setupTwoOrgs()
    const service = setup.container.modules.members.invitations
    const invitation = await invite(setup, { email: 'verified@example.test' })
    expect(await service.listPendingForEmail('verified@example.test')).toEqual([])
    expect(await service.hasPendingInvitation('VERIFIED@example.test')).toBe(true)
    await createTestUser(setup.container, { email: 'verified@example.test' })
    expect(await service.listPendingForEmail('verified@example.test')).toEqual([
      expect.objectContaining({
        invitationId: invitation.id,
        organizationId: setup.a.id,
        organizationName: 'Acme Research',
        role: 'user',
        invitedByName: 'adam',
      }),
    ])
    await setup.db.system('test', (tx) =>
      tx.execute(sql`update organizations set status = 'suspended', suspended_at = now()`),
    )
    expect(await service.listPendingForEmail('verified@example.test')).toEqual([])
    expect(await service.hasPendingInvitation('verified@example.test')).toBe(false)
  })
})

describe('delivery status', () => {
  it('records sent and "Not delivered" from the email job', async () => {
    const setup = await setupTwoOrgs()
    const { invitation, email } = await inviteWithToken(setup, 'mail@example.test')
    const [sendEmailJob] = setup.container.modules.notifications.jobs
    if (sendEmailJob === undefined) throw new Error('no sendEmail job')
    const { container } = setup
    const run = sendEmailJob.bind(container)
    const job = { id: 'j', data: email, attemptsMade: 0, opts: { attempts: 1 } }
    await run(job as never)
    const read = async () =>
      expectPage(
        await request(setup.app, 'GET', invitationsUrl(setup.a.id), {
          headers: setup.sessionOf(setup.a.members.adam),
        }),
        invitationDtoSchema,
      ).data
    const [sent] = await read()
    expect(sent).toMatchObject({ deliveryStatus: 'sent' })
    expect(sent?.lastSentAt).not.toBeNull()
    await container.modules.members.invitations.onEmailDelivery({
      payload: email,
      status: 'failed',
    })
    const [failed] = await read()
    expect(failed).toMatchObject({ id: invitation.id, deliveryStatus: 'failed' })
  })
})

describe('tenant isolation', () => {
  const resourceRoutes: OrgScopedRoute[] = [
    { method: 'POST', path: '/orgs/:orgId/invitations/:invitationId/resend' },
    { method: 'POST', path: '/orgs/:orgId/invitations/:invitationId/link' },
    { method: 'POST', path: '/orgs/:orgId/invitations/:invitationId/revoke' },
  ]
  const orgRoutes: OrgScopedRoute[] = [
    { method: 'GET', path: '/orgs/:orgId/invitations' },
    {
      method: 'POST',
      path: '/orgs/:orgId/invitations',
      payload: { email: 'intruder@example.test', role: 'user' },
    },
  ]

  it.each(resourceRoutes)("keeps A's invitation out of reach on $method $path", async (route) => {
    const setup = await setupTwoOrgs()
    const invitation = await invite(setup, { email: 'secret@example.test' })
    await expect(
      assertRouteIsolation(
        setup.app,
        route,
        setup.subjects({ invitationId: invitation.id }, [invitation.id, 'secret@example.test']),
      ),
    ).resolves.toBeUndefined()
  })

  it.each(orgRoutes)("answers 404 ORGANIZATION_NOT_FOUND on A's $method $path", async (route) => {
    const setup = await setupTwoOrgs()
    const invitation = await invite(setup, { email: 'secret@example.test' })
    const subjects = setup.subjects({}, [invitation.id, 'secret@example.test'])
    const cases = crossTenantCases(route, subjects).filter((c) => c.expected.code !== undefined)
    for (const testCase of cases) {
      expect(await checkCrossTenantCase(setup.app, testCase, subjects.orgA.markers)).toEqual([])
    }
  })

  it('holds at the database layer for invitation teams (tenant policy, FORCE RLS)', async () => {
    const setup = await setupTwoOrgs()
    const orgs = { a: setup.a.id, b: setup.b.id }
    const refs = new Map<string, { invitationId: string; teamId: string }>()
    for (const orgId of [orgs.a, orgs.b]) {
      refs.set(
        orgId,
        await setup.db.tenant(orgId, async (tx) => {
          const [team] = await tx
            .insert(teams)
            .values({ organizationId: orgId, name: 'T' })
            .returning()
          const [row] = await tx
            .insert(invitations)
            .values({
              organizationId: orgId,
              email: `p-${orgId.slice(0, 6)}@example.test`,
              role: 'user',
              tokenHash: Buffer.from(orgId.replaceAll('-', '').padEnd(64, '0'), 'hex'),
            })
            .returning()
          return { invitationId: row?.id ?? '', teamId: team?.id ?? '' }
        }),
      )
    }
    await expect(
      assertTenantIsolation(
        setup.db,
        {
          table: invitationTeams,
          organizationId: invitationTeams.organizationId,
          row: (orgId) => ({
            organizationId: orgId,
            ...(refs.get(orgId) ?? { invitationId: '', teamId: '' }),
          }),
        },
        orgs,
      ),
    ).resolves.toBeUndefined()
  })
})
