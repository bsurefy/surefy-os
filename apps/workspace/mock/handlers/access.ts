// SPDX-License-Identifier: AGPL-3.0-only
import {
  accessPolicyDtoSchema,
  effectiveAccessDtoSchema,
  ERROR_CODES,
  memberEffectiveAccessDtoSchema,
  teamEffectiveAccessDtoSchema,
  updateAccessPolicyInputSchema,
  FEATURES,
  okResponse,
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from '@surefy/contracts'
import type { AccessPolicyDto, EffectiveAccessDto, OrgRole } from '@surefy/contracts'
import { effectiveAccessFactory } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
} from '@surefy/web-core/testing/mock'

import { shellSafe, MAYA, OMAR } from './shell.fixtures'
import { ANA, SALES_TEAM_ID, SUPPORT_TEAM_ID } from './teams'

const SETTINGS_UPDATED_AT = '2026-10-02T09:00:00.000Z'
const NO_RESTRICTIONS: AccessPolicyDto['policy'] = { version: 1 }

/** Each team's own restrictions: Support has web search off, Sales sets nothing. */
function seedTeamPolicies(): Map<string, AccessPolicyDto> {
  return new Map([
    [
      SUPPORT_TEAM_ID,
      {
        teamId: SUPPORT_TEAM_ID,
        policy: { version: 1, tools: { webSearch: false } },
        updatedByUserId: MAYA.id,
        updatedAt: SETTINGS_UPDATED_AT,
      },
    ],
  ])
}

let teamPolicies = seedTeamPolicies()

/** Back to the seeded team policies; tests call it between cases. */
export function resetAccessMock(): void {
  teamPolicies = seedTeamPolicies()
}

const teamPolicyOf = (teamId: string): AccessPolicyDto =>
  teamPolicies.get(teamId) ?? {
    teamId,
    policy: NO_RESTRICTIONS,
    updatedByUserId: null,
    updatedAt: null,
  }

const KNOWN_TEAMS = new Set([SUPPORT_TEAM_ID, SALES_TEAM_ID])

function accessAs(role: OrgRole, overrides: Partial<EffectiveAccessDto> = {}): EffectiveAccessDto {
  return effectiveAccessFactory({ role, permissions: [...ROLE_PERMISSIONS[role]], ...overrides })
}

/**
 * `GET /api/v1/orgs/:orgId/access/me`: an Owner on Community by default. Scenarios: `role-user`,
 * `role-builder`, `role-admin`, `enterprise` (every feature), `forbidden` (a User without
 * notifications, for the permission-denied page), `web-search-off` (a User whose team turned web
 * search off). Its other failure scenarios keep the default, so
 * the shell stays up while a page shows its state. Live on the real API (I4-02); the handlers stay
 * for component tests and for `MOCK_DOMAINS=access`.
 */
export const accessDomain = defineMockDomain(
  'access',
  [
    defineMockHandler({
      method: 'get',
      path: '/orgs/:orgId/access/me',
      response: okResponse(effectiveAccessDtoSchema),
      scenarios: {
        default: () => mockOk(accessAs('owner')),
        ...shellSafe(() => mockOk(accessAs('owner'))),
        'role-user': () => mockOk(accessAs('user')),
        'role-builder': () => mockOk(accessAs('builder')),
        'role-admin': () => mockOk(accessAs('admin')),
        enterprise: () => mockOk(accessAs('owner', { features: Object.values(FEATURES) })),
        'web-search-off': () =>
          mockOk(
            accessAs('user', {
              teamIds: [SUPPORT_TEAM_ID],
              primaryTeamId: SUPPORT_TEAM_ID,
              tools: { webSearch: false, bridge: true, mcp: true, apiTools: true },
              reasons: [{ key: 'tool:webSearch', source: 'team', teamId: SUPPORT_TEAM_ID }],
            }),
          ),
        forbidden: () =>
          mockOk(
            accessAs('user', {
              permissions: ROLE_PERMISSIONS.user.filter(
                (permission) => permission !== PERMISSIONS.NOTIFICATIONS_READ,
              ),
            }),
          ),
      },
    }),

    defineMockHandler({
      method: 'get',
      path: '/orgs/:orgId/access/members/:userId',
      response: okResponse(memberEffectiveAccessDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const person = [MAYA, OMAR, ANA].find((candidate) => candidate.id === params.userId)
          if (!person) {
            return mockError(404, ERROR_CODES.MEMBER_NOT_FOUND, 'Member not found')
          }
          const role: OrgRole = person.id === MAYA.id ? 'owner' : 'builder'
          return mockOk({
            ...accessAs(role, {
              teamIds: [SUPPORT_TEAM_ID],
              primaryTeamId: SUPPORT_TEAM_ID,
              modules: ['chat', 'agents', 'knowledge', 'insights'],
              limits: {
                monthlySpendMicros: 50_000_000,
                maxAgents: 20,
                maxFlows: null,
                maxRunsPerMonth: 5000,
                maxStorageBytes: null,
                maxKnowledgeBases: 10,
              },
              reasons: [
                { key: 'module:train', source: 'team', teamId: SUPPORT_TEAM_ID },
                { key: 'module:flows', source: 'role' },
                { key: 'feature:sso', source: 'community' },
                { key: 'limit:maxAgents', source: 'organization' },
              ],
            }),
            user: person,
            teams: [{ id: SUPPORT_TEAM_ID, name: 'Support' }],
          })
        },
      },
    }),
    defineMockHandler({
      method: 'get',
      path: '/orgs/:orgId/access/teams/:teamId',
      response: okResponse(teamEffectiveAccessDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const name = { [SUPPORT_TEAM_ID]: 'Support', [SALES_TEAM_ID]: 'Sales' }[
            String(params.teamId)
          ]
          if (!name) return mockError(404, ERROR_CODES.TEAM_NOT_FOUND, 'Team not found')
          return mockOk({
            team: { id: String(params.teamId), name },
            modules: ['chat', 'agents', 'knowledge'],
            features: [],
            allowedModelIds: [],
            limits: {
              monthlySpendMicros: null,
              maxAgents: 10,
              maxFlows: null,
              maxRunsPerMonth: null,
              maxStorageBytes: null,
              maxKnowledgeBases: null,
            },
            reasons: [
              { key: 'module:train', source: 'team', teamId: String(params.teamId) },
              { key: 'module:flows', source: 'organization' },
            ],
          })
        },
      },
    }),
    defineMockHandler({
      method: 'get',
      path: '/orgs/:orgId/access/policy',
      response: okResponse(accessPolicyDtoSchema),
      scenarios: {
        default: () =>
          mockOk({ teamId: null, policy: NO_RESTRICTIONS, updatedByUserId: null, updatedAt: null }),
        'web-search-off-for-organization': () =>
          mockOk({
            teamId: null,
            policy: { version: 1, tools: { webSearch: false } },
            updatedByUserId: MAYA.id,
            updatedAt: SETTINGS_UPDATED_AT,
          }),
      },
    }),
    defineMockHandler({
      method: 'get',
      path: '/orgs/:orgId/teams/:teamId/access-policy',
      response: okResponse(accessPolicyDtoSchema),
      scenarios: {
        default: ({ params }) =>
          KNOWN_TEAMS.has(String(params.teamId))
            ? mockOk(teamPolicyOf(String(params.teamId)))
            : mockError(404, ERROR_CODES.TEAM_NOT_FOUND, 'Team not found'),
      },
    }),
    defineMockHandler({
      method: 'put',
      path: '/orgs/:orgId/teams/:teamId/access-policy',
      response: okResponse(accessPolicyDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          const teamId = String(params.teamId)
          if (!KNOWN_TEAMS.has(teamId)) {
            return mockError(404, ERROR_CODES.TEAM_NOT_FOUND, 'Team not found')
          }
          const policy = updateAccessPolicyInputSchema.parse(await request.json())
          const saved: AccessPolicyDto = {
            teamId,
            policy,
            updatedByUserId: MAYA.id,
            updatedAt: '2026-10-05T09:00:00.000Z',
          }
          teamPolicies.set(teamId, saved)
          return mockOk(saved)
        },
        'policy-forbidden': () =>
          mockError(403, ERROR_CODES.ACCESS_FORBIDDEN, "You don't have permission to do that"),
      },
    }),
  ],
  { isLive: true },
)
