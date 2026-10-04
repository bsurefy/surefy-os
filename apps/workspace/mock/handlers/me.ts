// SPDX-License-Identifier: AGPL-3.0-only
import { HttpResponse } from 'msw'
import { z } from 'zod'

import { meDtoSchema, okResponse, sessionDtoSchema, updateMeInputSchema } from '@surefy/contracts'
import type { MeDto, SessionDto } from '@surefy/contracts'
import { fixtureUuid } from '@surefy/web-core/testing'
import { defineMockDomain, defineMockHandler, mockOk } from '@surefy/web-core/testing/mock'

import { ACME_ORG, cloudMe, multiOrgMe, shellMe, shellSafe } from './shell.fixtures'

const NOW = '2026-01-15T09:00:00.000Z'

/**
 * `support-access`: BSurefy support holds a time-limited read-only grant on Acme, so the
 * workspace shows the non-dismissible access banner.
 */
function supportAccessMe(): MeDto {
  return {
    ...shellMe(),
    supportAccess: [
      {
        grantId: fixtureUuid(9, 1),
        organizationId: ACME_ORG.id,
        via: 'support',
        scope: 'read_only',
        reason: 'Ticket 4821: knowledge sync stalls',
        partnerName: null,
        startedAt: NOW,
        endsAt: '2026-01-15T13:00:00.000Z',
      },
    ],
  }
}

function sessionFixture(sequence: number, overrides: Partial<SessionDto>): SessionDto {
  return sessionDtoSchema.parse({
    id: fixtureUuid(3, sequence),
    app: 'workspace',
    ipAddress: '203.0.113.10',
    userAgent: null,
    isCurrent: false,
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: '2026-01-22T09:00:00.000Z',
    ...overrides,
  })
}

const SESSIONS: SessionDto[] = [
  sessionFixture(1, {
    isCurrent: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_2) AppleWebKit/605.1.15 Safari/605.1.15',
  }),
  sessionFixture(2, {
    ipAddress: '198.51.100.24',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) Mobile/15E148 Safari/604.1',
    updatedAt: '2026-01-14T18:30:00.000Z',
  }),
  sessionFixture(3, {
    ipAddress: null,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/132.0 Safari/537.36',
    updatedAt: '2026-01-10T08:00:00.000Z',
  }),
]

const meResponse = okResponse(meDtoSchema)

/**
 * `GET/PATCH /api/v1/me` and the person's sessions. Scenarios: `multi-org` (Enterprise, two
 * organizations), `cloud` (plans and credits), `support-access` (the access banner).
 */
export const meDomain = defineMockDomain('me', [
  defineMockHandler({
    method: 'get',
    path: '/me',
    response: meResponse,
    scenarios: {
      default: () => mockOk(shellMe()),
      ...shellSafe(() => mockOk(shellMe())),
      'multi-org': () => mockOk(multiOrgMe()),
      cloud: () => mockOk(cloudMe()),
      'support-access': () => mockOk(supportAccessMe()),
    },
  }),
  defineMockHandler({
    method: 'patch',
    path: '/me',
    response: meResponse,
    scenarios: {
      default: async ({ request }) => {
        const input = updateMeInputSchema.parse(await request.json())
        const me = shellMe()
        const { name, ...preferences } = input
        return mockOk({
          ...me,
          user: { ...me.user, name: name ?? me.user.name },
          preferences: { ...me.preferences, ...preferences },
        })
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: '/me/sessions',
    response: okResponse(z.array(sessionDtoSchema)),
    scenarios: {
      default: () => mockOk(SESSIONS),
      empty: () => mockOk(SESSIONS.filter((session) => session.isCurrent)),
    },
  }),
  defineMockHandler({
    method: 'delete',
    path: '/me/sessions/:sessionId',
    response: z.null(),
    scenarios: { default: () => new HttpResponse(null, { status: 204 }) },
  }),
  defineMockHandler({
    method: 'post',
    path: '/me/sessions/revoke-others',
    response: z.null(),
    scenarios: { default: () => new HttpResponse(null, { status: 204 }) },
  }),
])
