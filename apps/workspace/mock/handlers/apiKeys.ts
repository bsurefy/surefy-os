// SPDX-License-Identifier: AGPL-3.0-only
import {
  apiKeyCreatedDtoSchema,
  apiKeyDtoSchema,
  apiKeyImpactDtoSchema,
  createApiKeyInputSchema,
  ERROR_CODES,
  isApiKeyScopeAllowed,
  okResponse,
  pageResponse,
  PAGE_SIZE,
  PERMISSIONS,
  updateApiKeyInputSchema,
} from '@surefy/contracts'
import type { ApiKeyDto, ApiKeyImpactDto } from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { MAYA, OMAR } from './shell.fixtures'

const API_KEY_KIND = 60
const AGENT_KIND = 61
const HTTP_NOT_FOUND = 404
const HTTP_FORBIDDEN = 403
const HTTP_CONFLICT = 409
const HTTP_UNPROCESSABLE = 422
const NOW = '2026-01-15T09:00:00.000Z'
const SECRET = `sk_${'Zx9Qm2Lp'.repeat(6).slice(0, 43)}`

export const WEBSITE_KEY_ID = fixtureUuid(API_KEY_KIND, 1)
export const ZAPIER_KEY_ID = fixtureUuid(API_KEY_KIND, 2)
export const EXPIRED_KEY_ID = fixtureUuid(API_KEY_KIND, 3)
export const REVOKED_KEY_ID = fixtureUuid(API_KEY_KIND, 4)

/** An active key that runs agents and never expires, unless overridden. */
export const apiKeyFactory = defineFactory(apiKeyDtoSchema, (sequence): ApiKeyDto => ({
  id: fixtureUuid(API_KEY_KIND, sequence),
  name: `Key ${sequence}`,
  keyPrefix: `sk_Ab3dEf${String(sequence).padStart(2, '0')}`,
  scopes: [PERMISSIONS.AGENTS_INVOKE],
  status: 'active',
  expiresAt: null,
  isExpired: false,
  lastUsedAt: null,
  lastUsedIp: null,
  createdBy: MAYA,
  revokedAt: null,
  revokedBy: null,
  createdAt: '2026-01-02T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
}))

const SUPPORT_AGENT = { type: 'agent', id: fixtureUuid(AGENT_KIND, 1), name: 'Support triage' }
const HR_AGENT = { type: 'agent', id: fixtureUuid(AGENT_KIND, 2), name: 'HR helper' }

const IMPACTS: Record<string, ApiKeyImpactDto> = {
  [WEBSITE_KEY_ID]: {
    dependents: [{ type: 'agent', count: 2 }],
    listed: [SUPPORT_AGENT, HR_AGENT],
  },
}
const NO_IMPACT: ApiKeyImpactDto = { dependents: [], listed: [] }

function seedKeys(): ApiKeyDto[] {
  apiKeyFactory.reset()
  return [
    apiKeyFactory({
      name: 'Website backend',
      expiresAt: '2026-04-15T09:00:00.000Z',
      lastUsedAt: '2026-01-15T08:30:00.000Z',
      lastUsedIp: '203.0.113.7',
      createdAt: '2026-01-10T09:00:00.000Z',
    }),
    apiKeyFactory({
      name: 'Zapier',
      createdBy: OMAR,
      createdAt: '2026-01-05T09:00:00.000Z',
    }),
    apiKeyFactory({
      name: 'Old script',
      createdBy: null,
      expiresAt: '2026-01-01T09:00:00.000Z',
      isExpired: true,
      createdAt: '2025-10-01T09:00:00.000Z',
    }),
    apiKeyFactory({
      name: 'Retired job',
      status: 'revoked',
      revokedAt: '2026-01-08T09:00:00.000Z',
      revokedBy: MAYA,
      createdAt: '2025-12-01T09:00:00.000Z',
    }),
  ]
}

let keys = seedKeys()

/** Back to the seeded keys; tests call it between cases. */
export function resetApiKeysMock(): void {
  keys = seedKeys()
}

const path = '/orgs/:orgId/api-keys'
const find = (id: unknown) => keys.find((key) => key.id === id)
const replace = (updated: ApiKeyDto) => {
  keys = keys.map((key) => (key.id === updated.id ? updated : key))
  return updated
}
const notFound = () => mockError(HTTP_NOT_FOUND, ERROR_CODES.API_KEY_NOT_FOUND, 'API key not found')
const notFresh = () =>
  mockError(HTTP_FORBIDDEN, ERROR_CODES.AUTH_SESSION_NOT_FRESH, 'Sign in again')

/**
 * Organization API keys (B6-02's routes, live: the real API answers; the handlers stay for
 * component tests and `MOCK_DOMAINS=apiKeys` shows its states). The list holds an active key with
 * two agents behind it, an unused one, an expired one (its creator's account is erased) and a
 * revoked one, which only the Revoked filter shows. Scenarios: on a create, `session-not-fresh`
 * asks the person to confirm it's them and `scope-not-allowed` and `expiry-invalid` fail the form;
 * on a revoke, `session-not-fresh`; on the impact, `no-impact`.
 */
export const apiKeysDomain = defineMockDomain(
  'apiKeys',
  [
    defineMockHandler({
      method: 'get',
      path,
      response: pageResponse(apiKeyDtoSchema),
      scenarios: {
        default: ({ request }) => {
          const url = new URL(request.url)
          const q = url.searchParams.get('q')?.toLowerCase()
          const statuses = url.searchParams.getAll('status')
          const sort = url.searchParams.get('sort') ?? '-createdAt'
          const desc = sort.startsWith('-')
          const field = sort.replace(/^-/, '') as 'name' | 'createdAt' | 'lastUsedAt'
          const items = keys
            .filter(
              (key) =>
                (!q || key.name.toLowerCase().includes(q)) &&
                (statuses.length === 0 ? key.status === 'active' : statuses.includes(key.status)),
            )
            .sort((a, b) => (a[field] ?? '').localeCompare(b[field] ?? '') * (desc ? -1 : 1))
          const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
          const start = Number(url.searchParams.get('cursor') ?? 0)
          const next = start + limit < items.length ? String(start + limit) : null
          return mockPage(items.slice(start, start + limit), next)
        },
      },
    }),
    defineMockHandler({
      method: 'post',
      path,
      response: okResponse(apiKeyCreatedDtoSchema),
      scenarios: {
        default: async ({ request }) => {
          const input = createApiKeyInputSchema.parse(await request.json())
          if (!input.scopes.every(isApiKeyScopeAllowed)) {
            return mockError(
              HTTP_UNPROCESSABLE,
              ERROR_CODES.API_KEY_SCOPE_NOT_ALLOWED,
              'Scope not allowed',
            )
          }
          if (input.expiresAt && Date.parse(input.expiresAt) <= Date.parse(NOW)) {
            return mockError(
              HTTP_UNPROCESSABLE,
              ERROR_CODES.API_KEY_EXPIRY_INVALID,
              'Expiry in the past',
            )
          }
          const created = apiKeyFactory({
            name: input.name,
            scopes: input.scopes,
            expiresAt: input.expiresAt ?? null,
            createdBy: MAYA,
            createdAt: NOW,
            updatedAt: NOW,
          })
          keys = [created, ...keys]
          return mockOk({ apiKey: created, secret: SECRET }, { status: 201 })
        },
        'session-not-fresh': notFresh,
        'scope-not-allowed': () =>
          mockError(HTTP_UNPROCESSABLE, ERROR_CODES.API_KEY_SCOPE_NOT_ALLOWED, 'Scope not allowed'),
        'expiry-invalid': () =>
          mockError(HTTP_UNPROCESSABLE, ERROR_CODES.API_KEY_EXPIRY_INVALID, 'Expiry in the past'),
      },
    }),
    defineMockHandler({
      method: 'patch',
      path: `${path}/:keyId`,
      response: okResponse(apiKeyDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          const found = find(params.keyId)
          if (!found) return notFound()
          if (found.status === 'revoked') {
            return mockError(HTTP_CONFLICT, ERROR_CODES.API_KEY_REVOKED, 'Revoked')
          }
          const input = updateApiKeyInputSchema.parse(await request.json())
          return mockOk(replace({ ...found, name: input.name, updatedAt: NOW }))
        },
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/:keyId/impact`,
      response: okResponse(apiKeyImpactDtoSchema),
      scenarios: {
        default: ({ params }) =>
          find(params.keyId) ? mockOk(IMPACTS[String(params.keyId)] ?? NO_IMPACT) : notFound(),
        'no-impact': () => mockOk(NO_IMPACT),
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/:keyId/revoke`,
      response: okResponse(apiKeyDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const found = find(params.keyId)
          if (!found) return notFound()
          if (found.status === 'revoked') {
            return mockError(HTTP_CONFLICT, ERROR_CODES.API_KEY_REVOKED, 'Already revoked')
          }
          return mockOk(
            replace({
              ...found,
              status: 'revoked',
              revokedAt: NOW,
              revokedBy: MAYA,
              updatedAt: NOW,
            }),
          )
        },
      },
    }),
  ],
  { isLive: true },
)
