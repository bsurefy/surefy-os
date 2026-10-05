// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  bulkMemberActionInputSchema,
  bulkMemberActionResultDtoSchema,
  createInvitationInputSchema,
  ERROR_CODES,
  invitationDtoSchema,
  invitationLinkDtoSchema,
  memberDtoSchema,
  okResponse,
  pageResponse,
  PAGE_SIZE,
  updateMemberInputSchema,
} from '@surefy/contracts'
import type { InvitationDto, MemberDto } from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { MAYA, OMAR } from './shell.fixtures'
import { ANA, teamsOfUser } from './teams'

const MEMBER_KIND = 31
const INVITATION_KIND = 32
const HTTP_NOT_FOUND = 404
const HTTP_FORBIDDEN = 403
const HTTP_CONFLICT = 409
const HTTP_UNPROCESSABLE = 422
const NOW = '2026-01-15T09:00:00.000Z'

type MemberRecord = Omit<MemberDto, 'teams' | 'primaryTeamId'>

/** An active member who signs in with a password, unless overridden. */
export const memberFactory = defineFactory(memberDtoSchema, (sequence): MemberDto => ({
  id: fixtureUuid(MEMBER_KIND, sequence),
  user: OMAR,
  role: 'user',
  status: 'active',
  primaryTeamId: null,
  teams: [],
  signInMethod: { type: 'password', providerId: null },
  twoFactorEnabled: false,
  provisioningSource: 'invitation',
  lastActiveAt: '2026-01-15T08:00:00.000Z',
  joinedAt: '2026-01-03T09:00:00.000Z',
  invitedByUserId: MAYA.id,
  deactivatedAt: null,
  createdAt: '2026-01-03T09:00:00.000Z',
  updatedAt: '2026-01-03T09:00:00.000Z',
}))

/** A pending invitation, delivered, unless overridden. */
export const invitationFactory = defineFactory(invitationDtoSchema, (sequence): InvitationDto => ({
  id: fixtureUuid(INVITATION_KIND, sequence),
  email: `invited${sequence}@acme.test`,
  role: 'user',
  status: 'pending',
  deliveryStatus: 'sent',
  teams: [],
  invitedBy: { userId: MAYA.id, name: MAYA.name },
  expiresAt: '2026-01-22T09:00:00.000Z',
  lastSentAt: '2026-01-14T09:00:00.000Z',
  sendCount: 1,
  acceptedAt: null,
  revokedAt: null,
  createdAt: '2026-01-14T09:00:00.000Z',
  updatedAt: '2026-01-14T09:00:00.000Z',
}))

const LEE = { id: fixtureUuid(1, 4), name: 'Lee Chen', email: 'lee@acme.test', imageUrl: null }

function seedMembers(): MemberRecord[] {
  memberFactory.reset()
  const strip = ({ teams: _teams, primaryTeamId: _primary, ...rest }: MemberDto): MemberRecord =>
    rest
  return [
    memberFactory({
      user: MAYA,
      role: 'owner',
      twoFactorEnabled: true,
      provisioningSource: 'setup',
      invitedByUserId: null,
    }),
    memberFactory({ user: OMAR, role: 'builder' }),
    memberFactory({ user: ANA, role: 'admin', twoFactorEnabled: true }),
    memberFactory({
      user: LEE,
      role: 'user',
      status: 'deactivated',
      deactivatedAt: '2026-01-10T09:00:00.000Z',
      lastActiveAt: '2026-01-09T09:00:00.000Z',
    }),
  ].map(strip)
}

function seedInvitations(): InvitationDto[] {
  invitationFactory.reset()
  return [
    invitationFactory({ email: 'priya@acme.test', role: 'builder' }),
    invitationFactory({
      email: 'sam@acme.test',
      role: 'user',
      deliveryStatus: 'failed',
      lastSentAt: '2026-01-13T09:00:00.000Z',
    }),
    invitationFactory({
      email: 'old@acme.test',
      status: 'expired',
      expiresAt: '2026-01-05T09:00:00.000Z',
    }),
  ]
}

let members = seedMembers()
let invitations = seedInvitations()

/** Back to the seeded people and invitations; tests call it between cases. */
export function resetMembersMock(): void {
  members = seedMembers()
  invitations = seedInvitations()
}

function present(record: MemberRecord): MemberDto {
  return { ...record, ...teamsOfUser(record.user.id) }
}

const findMember = (id: unknown) => members.find((member) => member.id === id)
const replaceMember = (updated: MemberRecord) => {
  members = members.map((member) => (member.id === updated.id ? updated : member))
}

function page(items: readonly object[], url: URL) {
  const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
  const start = Number(url.searchParams.get('cursor') ?? 0)
  const next = start + limit < items.length ? String(start + limit) : null
  return mockPage(items.slice(start, start + limit) as never[], next)
}

const path = '/orgs/:orgId/members'
const invitationsPath = '/orgs/:orgId/invitations'
const noContent = () => new Response(null, { status: 204 })
const memberNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.MEMBER_NOT_FOUND, 'Member not found')
const invitationNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.INVITATION_NOT_FOUND, 'Invitation not found')

function isLastOwner(member: MemberRecord): boolean {
  return (
    member.role === 'owner' &&
    members.filter((other) => other.role === 'owner' && other.status === 'active').length === 1
  )
}

/**
 * Members and invitations (B2-05's routes) until the integration task (I4-02) switches to the
 * real API. Scenarios: `seat-limit` fails an invitation with `LIMIT_REACHED` (seats); `last-owner`
 * makes every demotion, deactivation and removal fail with `MEMBERS_LAST_OWNER`;
 * `transfer-required` makes a removal ask for the person who takes over their agents.
 */
export const membersDomain = defineMockDomain('members', [
  defineMockHandler({
    method: 'get',
    path,
    response: pageResponse(memberDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const url = new URL(request.url)
        const q = url.searchParams.get('q')?.toLowerCase()
        const role = url.searchParams.get('role')
        const status = url.searchParams.get('status')
        const teamId = url.searchParams.get('teamId')
        const sort = url.searchParams.get('sort') ?? 'name'
        const desc = sort.startsWith('-')
        const field = sort.replace(/^-/, '')
        const items = members
          .map(present)
          .filter(
            (member) =>
              (!q ||
                member.user.name.toLowerCase().includes(q) ||
                member.user.email.toLowerCase().includes(q)) &&
              (!role || member.role === role) &&
              (!status || member.status === status) &&
              (!teamId || member.teams.some((team) => team.id === teamId)),
          )
          .sort((a, b) => {
            const left = field === 'lastActiveAt' ? (a.lastActiveAt ?? '') : a.user.name
            const right = field === 'lastActiveAt' ? (b.lastActiveAt ?? '') : b.user.name
            return left.localeCompare(right) * (desc ? -1 : 1)
          })
        return page(items, url)
      },
    },
  }),
  defineMockHandler({
    method: 'patch',
    path: `${path}/:memberId`,
    response: okResponse(memberDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findMember(params.memberId)
        if (!found) return memberNotFound()
        const input = updateMemberInputSchema.parse(await request.json())
        if (input.role && input.role !== found.role && isLastOwner(found)) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.MEMBERS_LAST_OWNER, 'Last owner')
        }
        if (
          input.primaryTeamId &&
          !teamsOfUser(found.user.id).teams.some((team) => team.id === input.primaryTeamId)
        ) {
          return mockError(
            HTTP_UNPROCESSABLE,
            ERROR_CODES.MEMBERS_PRIMARY_TEAM_NOT_A_MEMBER,
            'Not one of their teams',
          )
        }
        const updated = { ...found, ...(input.role ? { role: input.role } : {}), updatedAt: NOW }
        replaceMember(updated)
        return mockOk(present(updated))
      },
      'last-owner': () => mockError(HTTP_CONFLICT, ERROR_CODES.MEMBERS_LAST_OWNER, 'Last owner'),
    },
  }),
  defineMockHandler({
    method: 'delete',
    path: `${path}/:memberId`,
    response: okResponse(z.null()),
    scenarios: {
      default: ({ params }) => {
        const found = findMember(params.memberId)
        if (!found) return memberNotFound()
        if (isLastOwner(found)) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.MEMBERS_LAST_OWNER, 'Last owner')
        }
        members = members.filter((member) => member.id !== found.id)
        return noContent()
      },
      'last-owner': () => mockError(HTTP_CONFLICT, ERROR_CODES.MEMBERS_LAST_OWNER, 'Last owner'),
      'transfer-required': () =>
        mockError(
          HTTP_UNPROCESSABLE,
          ERROR_CODES.MEMBERS_TRANSFER_REQUIRED,
          'Choose who takes over',
        ),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/:memberId/deactivate`,
    response: okResponse(memberDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findMember(params.memberId)
        if (!found) return memberNotFound()
        if (isLastOwner(found)) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.MEMBERS_LAST_OWNER, 'Last owner')
        }
        const updated = { ...found, status: 'deactivated' as const, deactivatedAt: NOW }
        replaceMember(updated)
        return mockOk(present(updated))
      },
      'last-owner': () => mockError(HTTP_CONFLICT, ERROR_CODES.MEMBERS_LAST_OWNER, 'Last owner'),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/:memberId/reactivate`,
    response: okResponse(memberDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findMember(params.memberId)
        if (!found) return memberNotFound()
        const updated = { ...found, status: 'active' as const, deactivatedAt: null }
        replaceMember(updated)
        return mockOk(present(updated))
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/bulk`,
    response: okResponse(bulkMemberActionResultDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const input = bulkMemberActionInputSchema.parse(await request.json())
        const skipped: { memberId: string; code: string }[] = []
        let affected = 0
        for (const memberId of input.memberIds) {
          const found = findMember(memberId)
          if (!found) {
            skipped.push({ memberId, code: ERROR_CODES.MEMBER_NOT_FOUND })
          } else if (input.action !== 'add-to-team' && isLastOwner(found)) {
            skipped.push({ memberId, code: ERROR_CODES.MEMBERS_LAST_OWNER })
          } else {
            affected += 1
            if (input.action === 'change-role') replaceMember({ ...found, role: input.role })
            if (input.action === 'deactivate') {
              replaceMember({ ...found, status: 'deactivated', deactivatedAt: NOW })
            }
          }
        }
        return mockOk({ affected, skipped })
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: invitationsPath,
    response: pageResponse(invitationDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const url = new URL(request.url)
        const q = url.searchParams.get('q')?.toLowerCase()
        const status = url.searchParams.get('status') ?? 'pending'
        return page(
          invitations.filter(
            (invitation) =>
              invitation.status === status && (!q || invitation.email.toLowerCase().includes(q)),
          ),
          url,
        )
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: invitationsPath,
    response: okResponse(invitationDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const input = createInvitationInputSchema.parse(await request.json())
        if (members.some((member) => member.user.email === input.email)) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.MEMBERS_ALREADY_MEMBER, 'Already a member')
        }
        if (
          invitations.some(
            (invitation) => invitation.email === input.email && invitation.status === 'pending',
          )
        ) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.MEMBERS_ALREADY_INVITED, 'Already invited')
        }
        const created = invitationFactory({ email: input.email, role: input.role })
        invitations = [created, ...invitations]
        return mockOk(created, { status: 201 })
      },
      'seat-limit': () =>
        mockError(HTTP_FORBIDDEN, ERROR_CODES.LIMIT_REACHED, 'Seat limit reached', {
          details: [{ path: '', code: 'seats', message: 'Seats', limit: 'seats', value: 50 }],
        }),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${invitationsPath}/:invitationId/resend`,
    response: okResponse(invitationDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = invitations.find((invitation) => invitation.id === params.invitationId)
        if (!found) return invitationNotFound()
        const updated = {
          ...found,
          deliveryStatus: 'sent' as const,
          sendCount: found.sendCount + 1,
          lastSentAt: NOW,
        }
        invitations = invitations.map((invitation) =>
          invitation.id === updated.id ? updated : invitation,
        )
        return mockOk(updated)
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${invitationsPath}/:invitationId/link`,
    response: okResponse(invitationLinkDtoSchema),
    scenarios: {
      default: ({ params }) => {
        if (!invitations.some((invitation) => invitation.id === params.invitationId)) {
          return invitationNotFound()
        }
        return mockOk({
          url: `http://localhost:3000/invite/${'a'.repeat(43)}`,
          expiresAt: '2026-01-22T09:00:00.000Z',
        })
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${invitationsPath}/:invitationId/revoke`,
    response: okResponse(invitationDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = invitations.find((invitation) => invitation.id === params.invitationId)
        if (!found) return invitationNotFound()
        const updated = { ...found, status: 'revoked' as const, revokedAt: NOW }
        invitations = invitations.map((invitation) =>
          invitation.id === updated.id ? updated : invitation,
        )
        return mockOk(updated)
      },
    },
  }),
])
