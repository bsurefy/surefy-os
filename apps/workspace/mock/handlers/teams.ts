// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  addTeamMembersInputSchema,
  addTeamMembersResultDtoSchema,
  createTeamInputSchema,
  ERROR_CODES,
  okResponse,
  pageResponse,
  PAGE_SIZE,
  teamDeletionImpactDtoSchema,
  teamDtoSchema,
  teamMemberDtoSchema,
  updateTeamInputSchema,
} from '@surefy/contracts'
import type { TeamDto, TeamMemberDto } from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { MAYA, OMAR } from './shell.fixtures'

const TEAM_KIND = 30
const HTTP_CONFLICT = 409
const HTTP_NOT_FOUND = 404
const HTTP_UNPROCESSABLE = 422

/** A team with no members and no lead, unless overridden. */
export const teamFactory = defineFactory(teamDtoSchema, (sequence): TeamDto => ({
  id: fixtureUuid(TEAM_KIND, sequence),
  name: `Team ${sequence}`,
  description: null,
  leadUserId: null,
  memberCount: 0,
  primaryMemberCount: 0,
  createdAt: '2026-01-02T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
}))

export const ANA = {
  id: fixtureUuid(1, 3),
  name: 'Ana Ruiz',
  email: 'ana@acme.test',
  imageUrl: null,
}

export const SUPPORT_TEAM_ID = fixtureUuid(TEAM_KIND, 1)
export const SALES_TEAM_ID = fixtureUuid(TEAM_KIND, 2)

interface TeamState {
  team: TeamDto
  members: TeamMemberDto[]
}

function teamMember(
  user: TeamMemberDto['user'],
  role: TeamMemberDto['role'],
  isLead: boolean,
  isPrimary: boolean,
): TeamMemberDto {
  return { user, role, isLead, isPrimary, addedAt: '2026-01-03T09:00:00.000Z' }
}

function seedTeams(): TeamState[] {
  teamFactory.reset()
  return [
    {
      team: teamFactory({
        name: 'Support',
        description: 'Answers customers and triages issues.',
        leadUserId: MAYA.id,
      }),
      members: [
        teamMember(MAYA, 'owner', true, true),
        teamMember(OMAR, 'builder', false, true),
        teamMember(ANA, 'admin', false, false),
      ],
    },
    {
      team: teamFactory({ name: 'Sales', description: null, leadUserId: null }),
      members: [teamMember(ANA, 'admin', false, true)],
    },
  ].map(withCounts)
}

function withCounts({ team, members }: TeamState): TeamState {
  return {
    team: {
      ...team,
      memberCount: members.length,
      primaryMemberCount: members.filter((member) => member.isPrimary).length,
    },
    members,
  }
}

let teams = seedTeams()

/** Back to the seeded teams; tests call it between cases. */
export function resetTeamsMock(): void {
  teams = seedTeams()
}

/** The teams of a person as the members mock needs them, with the one that is their primary team. */
export function teamsOfUser(userId: string): {
  teams: { id: string; name: string }[]
  primaryTeamId: string | null
} {
  const own = teams.filter(({ members }) => members.some(({ user }) => user.id === userId))
  const primary = own.find(({ members }) =>
    members.some(({ user, isPrimary }) => user.id === userId && isPrimary),
  )
  return {
    teams: own.map(({ team }) => ({ id: team.id, name: team.name })),
    primaryTeamId: primary?.team.id ?? null,
  }
}

const findTeam = (id: unknown) => teams.find(({ team }) => team.id === id)

function page(items: readonly object[], url: URL) {
  const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
  const start = Number(url.searchParams.get('cursor') ?? 0)
  const next = start + limit < items.length ? String(start + limit) : null
  return mockPage(items.slice(start, start + limit) as never[], next)
}

const path = '/orgs/:orgId/teams'
const noContent = () => new Response(null, { status: 204 })
const notFound = () => mockError(HTTP_NOT_FOUND, ERROR_CODES.TEAM_NOT_FOUND, 'Team not found')

/**
 * Teams and their members (B2-04's routes) until the integration task (I4-02) switches to the
 * real API. Scenarios: `name-taken` fails a create or rename with `TEAM_NAME_TAKEN`;
 * `has-connections` fails a delete with `TEAM_HAS_CONNECTIONS` and gives the impact connections.
 */
export const teamsDomain = defineMockDomain('teams', [
  defineMockHandler({
    method: 'get',
    path,
    response: pageResponse(teamDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const url = new URL(request.url)
        const q = url.searchParams.get('q')?.toLowerCase()
        const sort = url.searchParams.get('sort') ?? 'name'
        const items = teams
          .map(({ team }) => team)
          .filter((team) => !q || team.name.toLowerCase().includes(q))
          .sort((a, b) => a.name.localeCompare(b.name) * (sort.startsWith('-') ? -1 : 1))
        return page(items, url)
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path,
    response: okResponse(teamDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const input = createTeamInputSchema.parse(await request.json())
        if (teams.some(({ team }) => team.name.toLowerCase() === input.name.toLowerCase())) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.TEAM_NAME_TAKEN, 'Name taken')
        }
        const state = withCounts({
          team: teamFactory({
            name: input.name,
            description: input.description ?? null,
            leadUserId: input.leadUserId ?? null,
          }),
          members: [],
        })
        teams = [...teams, state]
        return mockOk(state.team, { status: 201 })
      },
      'name-taken': () => mockError(HTTP_CONFLICT, ERROR_CODES.TEAM_NAME_TAKEN, 'Name taken'),
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/:teamId`,
    response: okResponse(teamDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findTeam(params.teamId)
        return found ? mockOk(found.team) : notFound()
      },
    },
  }),
  defineMockHandler({
    method: 'patch',
    path: `${path}/:teamId`,
    response: okResponse(teamDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findTeam(params.teamId)
        if (!found) return notFound()
        const input = updateTeamInputSchema.parse(await request.json())
        if (
          input.name &&
          teams.some(
            ({ team }) =>
              team.id !== found.team.id && team.name.toLowerCase() === input.name?.toLowerCase(),
          )
        ) {
          return mockError(HTTP_CONFLICT, ERROR_CODES.TEAM_NAME_TAKEN, 'Name taken')
        }
        if (input.leadUserId && !found.members.some(({ user }) => user.id === input.leadUserId)) {
          return mockError(
            HTTP_UNPROCESSABLE,
            ERROR_CODES.TEAM_LEAD_NOT_A_MEMBER,
            'The lead must be a member',
          )
        }
        const updated = withCounts({
          team: { ...found.team, ...input },
          members: found.members.map((member) => ({
            ...member,
            isLead: (input.leadUserId ?? found.team.leadUserId) === member.user.id,
          })),
        })
        teams = teams.map((state) => (state.team.id === updated.team.id ? updated : state))
        return mockOk(updated.team)
      },
      'name-taken': () => mockError(HTTP_CONFLICT, ERROR_CODES.TEAM_NAME_TAKEN, 'Name taken'),
    },
  }),
  defineMockHandler({
    method: 'delete',
    path: `${path}/:teamId`,
    response: okResponse(z.null()),
    scenarios: {
      default: ({ params }) => {
        if (!findTeam(params.teamId)) return notFound()
        teams = teams.filter(({ team }) => team.id !== params.teamId)
        return noContent()
      },
      'has-connections': () =>
        mockError(HTTP_CONFLICT, ERROR_CODES.TEAM_HAS_CONNECTIONS, 'Decide on the connections'),
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/:teamId/deletion-impact`,
    response: okResponse(teamDeletionImpactDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findTeam(params.teamId)
        if (!found) return notFound()
        return mockOk({
          memberCount: found.team.memberCount,
          primaryMemberCount: found.team.primaryMemberCount,
          connectionCount: 0,
          dependents: [
            { type: 'agent', count: 2 },
            { type: 'knowledge_base', count: 1 },
          ],
        })
      },
      'has-connections': ({ params }) => {
        const found = findTeam(params.teamId)
        if (!found) return notFound()
        return mockOk({
          memberCount: found.team.memberCount,
          primaryMemberCount: found.team.primaryMemberCount,
          connectionCount: 3,
          dependents: [{ type: 'agent', count: 2 }],
        })
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/:teamId/members`,
    response: pageResponse(teamMemberDtoSchema),
    scenarios: {
      default: ({ params, request }) => {
        const found = findTeam(params.teamId)
        if (!found) return notFound()
        const url = new URL(request.url)
        const q = url.searchParams.get('q')?.toLowerCase()
        return page(
          found.members.filter(
            ({ user }) =>
              !q || user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q),
          ),
          url,
        )
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/:teamId/members`,
    response: okResponse(addTeamMembersResultDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findTeam(params.teamId)
        if (!found) return notFound()
        const { userIds } = addTeamMembersInputSchema.parse(await request.json())
        const known = [MAYA, OMAR, ANA]
        const added = userIds.filter((id) => !found.members.some(({ user }) => user.id === id))
        const newMembers = added.flatMap((id) => {
          const user = known.find((person) => person.id === id)
          return user ? [teamMember(user, 'user', false, false)] : []
        })
        const updated = withCounts({ ...found, members: [...found.members, ...newMembers] })
        teams = teams.map((state) => (state.team.id === updated.team.id ? updated : state))
        return mockOk({ added: newMembers.length }, { status: 201 })
      },
    },
  }),
  defineMockHandler({
    method: 'delete',
    path: `${path}/:teamId/members/:userId`,
    response: okResponse(z.null()),
    scenarios: {
      default: ({ params }) => {
        const found = findTeam(params.teamId)
        if (!found) return notFound()
        if (!found.members.some(({ user }) => user.id === params.userId)) {
          return mockError(HTTP_NOT_FOUND, ERROR_CODES.TEAM_MEMBER_NOT_FOUND, 'Not in this team')
        }
        const updated = withCounts({
          team: {
            ...found.team,
            leadUserId:
              found.team.leadUserId === String(params.userId) ? null : found.team.leadUserId,
          },
          members: found.members.filter(({ user }) => user.id !== params.userId),
        })
        teams = teams.map((state) => (state.team.id === updated.team.id ? updated : state))
        return noContent()
      },
    },
  }),
])
