// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  BUILT_IN_CONNECTION_PROVIDERS,
  CONNECTIONS_ERROR_CODES,
  completeOauthInputSchema,
  connectionCheckDtoSchema,
  connectionDtoSchema,
  connectionImpactDtoSchema,
  connectionProviderDtoSchema,
  createConnectionInputSchema,
  ERROR_CODES,
  IMPACT_LISTED_MAX,
  oauthCompleteDtoSchema,
  oauthStartDtoSchema,
  okResponse,
  pageResponse,
  PAGE_SIZE,
  reconnectConnectionInputSchema,
  startOauthInputSchema,
  updateConnectionInputSchema,
} from '@surefy/contracts'
import type { ConnectionDto, ConnectionImpactDto, StartOauthInput } from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { MAYA, OMAR } from './shell.fixtures'
import { SUPPORT_TEAM_ID } from './teams'

const CONNECTION_KIND = 70
const AGENT_KIND = 71
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_UNPROCESSABLE = 422
const NOW = '2026-01-15T09:00:00.000Z'
const OAUTH_AUTHORIZE_URL = 'https://accounts.example.test/oauth/authorize'
const OAUTH_EXPIRES_AT = '2026-01-15T09:10:00.000Z'
const MOCK_ACCOUNT = MAYA.email
const BILLING_BASE_URL = 'https://billing.acme.test/api'
const MCP_BASE_URL = 'https://mcp.acme.test'

export const GOOGLE_DRIVE_ID = fixtureUuid(CONNECTION_KIND, 1)
export const SLACK_ID = fixtureUuid(CONNECTION_KIND, 2)
export const NOTION_ID = fixtureUuid(CONNECTION_KIND, 3)
export const BILLING_ID = fixtureUuid(CONNECTION_KIND, 4)
export const DOCS_MCP_ID = fixtureUuid(CONNECTION_KIND, 5)
export const WHATSAPP_ID = fixtureUuid(CONNECTION_KIND, 6)

/** An active organization-wide API tool with no secret on show, unless overridden. */
export const connectionFactory = defineFactory(connectionDtoSchema, (sequence): ConnectionDto => ({
  id: fixtureUuid(CONNECTION_KIND, sequence),
  providerKey: 'http',
  kind: 'api_tool',
  bridgeId: null,
  authType: 'none',
  name: `Connection ${sequence}`,
  scope: 'organization',
  team: null,
  owner: null,
  baseUrl: null,
  secretLast4: null,
  oauthScopes: null,
  externalAccountLabel: null,
  status: 'active',
  statusReasonCode: null,
  tokenExpiresAt: null,
  lastRefreshedAt: null,
  lastUsedAt: null,
  usedByCount: 0,
  connectedBy: MAYA,
  revokedAt: null,
  createdAt: '2026-01-02T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
}))

const agent = (sequence: number, name: string) => ({
  type: 'agent',
  id: fixtureUuid(AGENT_KIND, sequence),
  name,
})

const IMPACTS: Record<string, ConnectionImpactDto> = {
  [GOOGLE_DRIVE_ID]: {
    dependents: [{ type: 'knowledge_source', count: 3 }],
    listed: [
      { type: 'knowledge_source', id: fixtureUuid(72, 1), name: 'Company handbook' },
      { type: 'knowledge_source', id: fixtureUuid(72, 2), name: 'Sales playbooks' },
      { type: 'knowledge_source', id: fixtureUuid(72, 3), name: 'Support macros' },
    ],
  },
  [SLACK_ID]: {
    dependents: [
      { type: 'agent', count: 3 },
      { type: 'channel', count: 1 },
    ],
    listed: [
      agent(1, 'Support triage'),
      agent(2, 'HR helper'),
      agent(3, 'Standup notes'),
      { type: 'channel', id: fixtureUuid(73, 1), name: "Support triage's Slack channel" },
    ],
  },
  [BILLING_ID]: { dependents: [{ type: 'agent', count: 1 }], listed: [agent(4, 'Invoice helper')] },
}
const NO_IMPACT: ConnectionImpactDto = { dependents: [], listed: [] }

/** Dependents beyond what the dialog lists: the cap of names and "and 4 more". */
const MANY_DEPENDENTS = IMPACT_LISTED_MAX + 4

function seedConnections(): ConnectionDto[] {
  connectionFactory.reset()
  return [
    connectionFactory({
      providerKey: 'google-drive',
      kind: 'knowledge_connector',
      authType: 'oauth2',
      name: 'Google Drive',
      externalAccountLabel: MOCK_ACCOUNT,
      oauthScopes: ['drive.readonly'],
      usedByCount: 3,
      lastUsedAt: '2026-01-15T08:00:00.000Z',
      createdAt: '2026-01-03T09:00:00.000Z',
    }),
    connectionFactory({
      providerKey: 'slack',
      kind: 'channel',
      authType: 'oauth2',
      name: 'Acme Slack',
      externalAccountLabel: 'acme.slack.com',
      status: 'expired',
      statusReasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED,
      usedByCount: 4,
      lastUsedAt: '2026-01-12T10:00:00.000Z',
      createdAt: '2026-01-04T09:00:00.000Z',
    }),
    connectionFactory({
      providerKey: 'notion',
      kind: 'knowledge_connector',
      authType: 'bearer',
      name: "Omar's Notion",
      scope: 'personal',
      owner: OMAR,
      connectedBy: OMAR,
      secretLast4: 'a4f2',
      usedByCount: 1,
      lastUsedAt: '2026-01-14T09:00:00.000Z',
      createdAt: '2026-01-05T09:00:00.000Z',
    }),
    connectionFactory({
      providerKey: 'http',
      kind: 'api_tool',
      authType: 'api_key',
      name: 'Billing API',
      scope: 'team',
      team: { id: SUPPORT_TEAM_ID, name: 'Support' },
      baseUrl: BILLING_BASE_URL,
      secretLast4: 'c9d1',
      status: 'error',
      statusReasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
      usedByCount: 1,
      lastUsedAt: '2026-01-13T09:00:00.000Z',
      createdAt: '2026-01-06T09:00:00.000Z',
    }),
    connectionFactory({
      providerKey: 'mcp',
      kind: 'mcp_server',
      authType: 'none',
      name: 'Docs MCP',
      baseUrl: MCP_BASE_URL,
      createdAt: '2026-01-07T09:00:00.000Z',
    }),
    connectionFactory({
      providerKey: 'whatsapp',
      kind: 'channel',
      authType: 'bearer',
      name: 'WhatsApp support',
      secretLast4: '77be',
      status: 'revoked',
      revokedAt: '2026-01-08T09:00:00.000Z',
      createdAt: '2025-12-01T09:00:00.000Z',
    }),
  ]
}

let connections = seedConnections()
/** Started OAuth sign-ins by `state`, until `oauth/complete` uses them. */
let pending = new Map<string, StartOauthInput>()
let signIns = 0

/** Back to the seeded connections; tests call it between cases. */
export function resetConnectionsMock(): void {
  connections = seedConnections()
  pending = new Map()
  signIns = 0
}

const path = '/orgs/:orgId/connections'
const find = (id: unknown) => connections.find((connection) => connection.id === id)
/** A connection as the mock holds it now: agent channels show its name and state. */
export const findMockConnection = (id: unknown): ConnectionDto | undefined => find(id)
const replace = (updated: ConnectionDto) => {
  connections = connections.map((connection) =>
    connection.id === updated.id ? updated : connection,
  )
  return updated
}
const notFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.CONNECTION_NOT_FOUND, 'Connection not found')
const revokedError = () =>
  mockError(HTTP_CONFLICT, ERROR_CODES.CONNECTION_REVOKED, 'Connection disconnected')
const failure = (code: keyof typeof CONNECTIONS_ERROR_CODES, status = HTTP_UNPROCESSABLE) =>
  mockError(status, CONNECTIONS_ERROR_CODES[code], code)

const KIND_OF_PROVIDER = new Map<string, ConnectionDto['kind']>(
  BUILT_IN_CONNECTION_PROVIDERS.map((provider) => [provider.key, provider.kind]),
)

/** The connection a successful check stores: signed in as the mock account. */
function buildConnection(input: StartOauthInput | z.infer<typeof createConnectionInputSchema>) {
  const authType = 'authType' in input ? input.authType : 'oauth2'
  const secret = 'secret' in input ? input.secret : null
  const providerName = BUILT_IN_CONNECTION_PROVIDERS.find(
    (provider) => provider.key === input.providerKey,
  )
  return connectionFactory({
    providerKey: input.providerKey,
    kind: KIND_OF_PROVIDER.get(input.providerKey) ?? 'api_tool',
    authType,
    name: input.name ?? providerName?.key ?? input.providerKey,
    scope: input.scope,
    team: input.teamId ? { id: input.teamId, name: 'Support' } : null,
    owner: input.scope === 'personal' ? MAYA : null,
    baseUrl: input.baseUrl ?? null,
    secretLast4: secret ? secret.slice(-4) : null,
    externalAccountLabel: authType === 'oauth2' && !('tokenUrl' in input) ? MOCK_ACCOUNT : null,
    connectedBy: MAYA,
    createdAt: NOW,
    updatedAt: NOW,
  })
}

/**
 * Connections (B6-01's routes, live: the real API answers; the handlers stay for component tests
 * and `MOCK_DOMAINS=connections` shows its states). The list holds a Google Drive source, an
 * expired Slack sign-in (four things depend on it), Omar's personal Notion key, a team API tool the
 * app rejects, an open MCP server and a disconnected WhatsApp number, which only the Disconnected
 * filter shows. Scenarios: on the list `own-only` (what a Builder is sent); on the providers
 * `oauth-not-configured`; on a create `provider-rejected`, `unreachable`, `base-url-not-allowed`
 * and `duplicate`; on `oauth/complete` `denied`, `state-invalid` and `account-mismatch`; on a
 * reconnect `provider-rejected`; on a test `failed`; on the impact `no-impact` and `many`.
 */
export const connectionsDomain = defineMockDomain(
  'connections',
  [
    defineMockHandler({
      method: 'get',
      path: `${path}/providers`,
      response: okResponse(z.array(connectionProviderDtoSchema)),
      scenarios: {
        default: () => mockOk(providers(true)),
        'oauth-not-configured': () => mockOk(providers(false)),
      },
    }),
    defineMockHandler({
      method: 'get',
      path,
      response: pageResponse(connectionDtoSchema),
      scenarios: {
        default: ({ request }) => listConnections(new URL(request.url), false),
        'own-only': ({ request }) => listConnections(new URL(request.url), true),
      },
    }),
    defineMockHandler({
      method: 'post',
      path,
      response: okResponse(connectionDtoSchema),
      scenarios: {
        default: async ({ request }) => {
          const input = createConnectionInputSchema.parse(await request.json())
          const created = buildConnection(input)
          connections = [created, ...connections]
          return mockOk(created, { status: 201 })
        },
        'provider-rejected': () => failure('CONNECTION_PROVIDER_REJECTED'),
        unreachable: () => failure('CONNECTION_UNREACHABLE'),
        'base-url-not-allowed': () => failure('CONNECTION_BASE_URL_NOT_ALLOWED'),
        duplicate: () => failure('CONNECTION_DUPLICATE', HTTP_CONFLICT),
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/oauth/start`,
      response: okResponse(oauthStartDtoSchema),
      scenarios: {
        default: async ({ request }) => {
          const input = startOauthInputSchema.parse(await request.json())
          signIns += 1
          const state = `mock-state-${signIns}`
          pending.set(state, input)
          return mockOk({
            flow: 'authorization_code' as const,
            authorizationUrl: `${OAUTH_AUTHORIZE_URL}?state=${state}`,
            state,
            expiresAt: OAUTH_EXPIRES_AT,
          })
        },
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/oauth/complete`,
      response: okResponse(oauthCompleteDtoSchema),
      scenarios: {
        default: async ({ request }) => {
          const input = completeOauthInputSchema.parse(await request.json())
          const started = pending.get(input.state)
          if (!started) return failure('CONNECTION_OAUTH_STATE_INVALID')
          pending.delete(input.state)
          if (input.error !== undefined) return failure('CONNECTION_OAUTH_DENIED')
          const target = started.reconnectConnectionId ? find(started.reconnectConnectionId) : null
          if (started.reconnectConnectionId && !target) return notFound()
          const connection = target
            ? replace({
                ...target,
                status: 'active',
                statusReasonCode: null,
                lastRefreshedAt: NOW,
                updatedAt: NOW,
              })
            : buildConnection(started)
          if (!target) connections = [connection, ...connections]
          return mockOk({
            connection,
            outcome: target ? ('reconnected' as const) : ('created' as const),
            returnTo: started.returnTo ?? null,
          })
        },
        denied: () => failure('CONNECTION_OAUTH_DENIED'),
        'state-invalid': () => failure('CONNECTION_OAUTH_STATE_INVALID'),
        'account-mismatch': () => failure('CONNECTION_ACCOUNT_MISMATCH'),
      },
    }),
    defineMockHandler({
      method: 'patch',
      path: `${path}/:connectionId`,
      response: okResponse(connectionDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          const found = find(params.connectionId)
          if (!found) return notFound()
          if (found.status === 'revoked') return revokedError()
          const input = updateConnectionInputSchema.parse(await request.json())
          return mockOk(replace({ ...found, ...input, updatedAt: NOW }))
        },
        'base-url-not-allowed': () => failure('CONNECTION_BASE_URL_NOT_ALLOWED'),
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/:connectionId/impact`,
      response: okResponse(connectionImpactDtoSchema),
      scenarios: {
        default: ({ params }) =>
          find(params.connectionId)
            ? mockOk(IMPACTS[String(params.connectionId)] ?? NO_IMPACT)
            : notFound(),
        'no-impact': () => mockOk(NO_IMPACT),
        many: () =>
          mockOk({
            dependents: [{ type: 'agent', count: MANY_DEPENDENTS }],
            listed: Array.from({ length: IMPACT_LISTED_MAX }, (_, index) =>
              agent(index + 1, `Agent ${index + 1}`),
            ),
          }),
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/:connectionId/reconnect`,
      response: okResponse(connectionDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          const found = find(params.connectionId)
          if (!found) return notFound()
          if (found.status === 'revoked') return revokedError()
          const input = reconnectConnectionInputSchema.parse(await request.json())
          const secret = 'secret' in input ? input.secret : null
          return mockOk(
            replace({
              ...found,
              status: 'active',
              statusReasonCode: null,
              secretLast4: secret ? secret.slice(-4) : found.secretLast4,
              lastRefreshedAt: NOW,
              updatedAt: NOW,
            }),
          )
        },
        'provider-rejected': () => failure('CONNECTION_PROVIDER_REJECTED'),
        'account-mismatch': () => failure('CONNECTION_ACCOUNT_MISMATCH'),
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/:connectionId/test`,
      response: okResponse(connectionCheckDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const found = find(params.connectionId)
          if (!found) return notFound()
          if (found.status === 'revoked') return revokedError()
          // a connection that works again is active
          const connection = replace({
            ...found,
            status: 'active',
            statusReasonCode: null,
            updatedAt: NOW,
          })
          return mockOk({
            ok: true,
            latencyMs: 142,
            reasonCode: null,
            externalAccountLabel: connection.externalAccountLabel,
            connection,
            testedAt: NOW,
          })
        },
        failed: ({ params }) => {
          const found = find(params.connectionId)
          if (!found) return notFound()
          const connection = replace({
            ...found,
            status: 'error',
            statusReasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
            updatedAt: NOW,
          })
          return mockOk({
            ok: false,
            latencyMs: null,
            reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
            externalAccountLabel: null,
            connection,
            testedAt: NOW,
          })
        },
      },
    }),
    defineMockHandler({
      method: 'post',
      path: `${path}/:connectionId/revoke`,
      response: okResponse(connectionDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const found = find(params.connectionId)
          if (!found) return notFound()
          if (found.status === 'revoked') return revokedError()
          return mockOk(replace({ ...found, status: 'revoked', revokedAt: NOW, updatedAt: NOW }))
        },
      },
    }),
  ],
  { isLive: true },
)

function providers(oauthConfigured: boolean) {
  return BUILT_IN_CONNECTION_PROVIDERS.map((provider) => ({
    providerKey: provider.key,
    kind: provider.kind,
    authTypes: [...provider.authTypes],
    oauthFlows: [...provider.oauthFlows],
    requiresBaseUrl: provider.requiresBaseUrl,
    requiredExtra: [...provider.requiredExtra],
    oauthConfigured,
    connectionCount: connections.filter(
      (connection) => connection.providerKey === provider.key && connection.status !== 'revoked',
    ).length,
  }))
}

const SORT_FIELDS = ['name', 'createdAt', 'lastUsedAt'] as const

function listConnections(url: URL, ownOnly: boolean) {
  const q = url.searchParams.get('q')?.toLowerCase()
  const only = (key: string) => url.searchParams.getAll(key)
  const [providerKeys, kinds, scopes, statuses] = [
    only('providerKey'),
    only('kind'),
    only('scope'),
    only('status'),
  ]
  const teamId = url.searchParams.get('teamId')
  const sort = url.searchParams.get('sort') ?? 'name'
  const desc = sort.startsWith('-')
  const field = SORT_FIELDS.find((item) => item === sort.replace(/^-/, '')) ?? 'name'
  const matches = (list: string[], value: string) => list.length === 0 || list.includes(value)
  const items = connections
    .filter(
      (connection) =>
        (!ownOnly || connection.connectedBy?.id === MAYA.id) &&
        (!q || connection.name.toLowerCase().includes(q)) &&
        matches(providerKeys, connection.providerKey) &&
        matches(kinds, connection.kind) &&
        matches(scopes, connection.scope) &&
        (!teamId || connection.team?.id === teamId) &&
        // disconnected connections stay hidden until that filter is chosen
        (statuses.length === 0
          ? connection.status !== 'revoked'
          : statuses.includes(connection.status)),
    )
    .sort((a, b) => (a[field] ?? '').localeCompare(b[field] ?? '') * (desc ? -1 : 1))
  const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
  const start = Number(url.searchParams.get('cursor') ?? 0)
  const next = start + limit < items.length ? String(start + limit) : null
  return mockPage(items.slice(start, start + limit), next)
}
