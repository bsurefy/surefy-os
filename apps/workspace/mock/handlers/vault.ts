// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  AI_PROVIDER_KEYS,
  connectionTestDtoSchema,
  connectionTestInputSchema,
  createCredentialInputSchema,
  createLocalServerInputSchema,
  createPersonalCredentialInputSchema,
  credentialDtoSchema,
  credentialImpactDtoSchema,
  ERROR_CODES,
  localServerSyncDtoSchema,
  okResponse,
  pageResponse,
  PAGE_SIZE,
  providerCardDtoSchema,
  updateCredentialInputSchema,
} from '@surefy/contracts'
import type {
  ConnectionFailureCode,
  ConnectionTestDto,
  CredentialDto,
  DetectedModelDto,
  ProviderCardDto,
} from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
  mockPage,
} from '@surefy/web-core/testing/mock'

import { MAYA, OMAR } from './shell.fixtures'
import { SALES_TEAM_ID, SUPPORT_TEAM_ID } from './teams'

const CREDENTIAL_KIND = 50
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_UNPROCESSABLE = 422
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const EXPIRING_IN_DAYS = 5

export const OPENAI_KEY_ID = fixtureUuid(CREDENTIAL_KIND, 1)
export const ANTHROPIC_KEY_ID = fixtureUuid(CREDENTIAL_KIND, 2)
export const OLLAMA_SERVER_ID = fixtureUuid(CREDENTIAL_KIND, 3)

const SUPPORT_TEAM = { id: SUPPORT_TEAM_ID, name: 'Support' }
const SALES_TEAM = { id: SALES_TEAM_ID, name: 'Sales' }

/** An active, primary organization key for OpenAI, unless overridden. */
export const credentialFactory = defineFactory(credentialDtoSchema, (sequence): CredentialDto => ({
  id: fixtureUuid(CREDENTIAL_KIND, sequence),
  name: `Key ${sequence}`,
  kind: 'ai_provider',
  providerKey: 'openai',
  scope: 'organization',
  team: null,
  owner: null,
  isPrimary: true,
  baseUrl: null,
  secretLast4: 'a1B2',
  status: 'active',
  statusReasonCode: null,
  statusCheckedAt: '2026-10-01T09:00:00.000Z',
  lastSuccessAt: '2026-10-01T09:00:00.000Z',
  expiresAt: null,
  lastUsedAt: '2026-10-03T09:00:00.000Z',
  rotatedFromId: null,
  replacedBy: null,
  createdBy: MAYA,
  revokedAt: null,
  spendThisMonth: [],
  modelCount: null,
  createdAt: '2026-01-05T09:00:00.000Z',
  updatedAt: '2026-01-05T09:00:00.000Z',
}))

function seedCredentials(): CredentialDto[] {
  credentialFactory.reset()
  return [
    credentialFactory({
      name: 'OpenAI production',
      spendThisMonth: [{ currency: 'USD', costMicros: 42_300_000 }],
    }),
    credentialFactory({
      name: 'Anthropic for Support',
      providerKey: 'anthropic',
      scope: 'team',
      team: SUPPORT_TEAM,
      secretLast4: 'x9Qz',
      spendThisMonth: [{ currency: 'USD', costMicros: 8_100_000 }],
    }),
    credentialFactory({
      name: 'GPU box',
      kind: 'local_server',
      providerKey: 'ollama',
      baseUrl: 'https://gpu.internal:11434',
      secretLast4: null,
      modelCount: 2,
    }),
    credentialFactory({
      name: "Omar's OpenAI key",
      scope: 'personal',
      owner: OMAR,
      secretLast4: null,
      createdBy: OMAR,
      spendThisMonth: [{ currency: 'USD', costMicros: 1_200_000 }],
    }),
    credentialFactory({
      name: 'My OpenAI key',
      scope: 'personal',
      owner: MAYA,
      secretLast4: 'm4Yz',
    }),
  ]
}

let credentials = seedCredentials()

/** Back to the seeded keys; tests call it between cases. */
export function resetVaultMock(): void {
  credentials = seedCredentials()
}

const findCredential = (id: unknown) => credentials.find((credential) => credential.id === id)
const replaceCredential = (updated: CredentialDto) => {
  credentials = credentials.map((credential) =>
    credential.id === updated.id ? updated : credential,
  )
}

/** Models a test or sync finds, per kind of connection. */
const AI_MODELS: DetectedModelDto[] = [
  { providerModelId: 'gpt-4.1', displayName: 'GPT-4.1', type: 'chat', inCatalog: true },
  { providerModelId: 'gpt-4.1-mini', displayName: 'GPT-4.1 mini', type: 'chat', inCatalog: true },
  {
    providerModelId: 'text-embedding-3-small',
    displayName: 'Text embedding 3 small',
    type: 'embedding',
    inCatalog: true,
  },
]
const LOCAL_MODELS: DetectedModelDto[] = [
  { providerModelId: 'llama3.1:70b', displayName: 'llama3.1:70b', type: 'chat', inCatalog: false },
  {
    providerModelId: 'nomic-embed-text',
    displayName: 'nomic-embed-text',
    type: 'embedding',
    inCatalog: false,
  },
]

function testResult(overrides: Partial<ConnectionTestDto> = {}): ConnectionTestDto {
  return {
    ok: true,
    latencyMs: 420,
    reasonCode: null,
    checkedUrl: null,
    models: AI_MODELS,
    duplicateOf: null,
    testedAt: '2026-10-05T09:00:00.000Z',
    ...overrides,
  }
}

function failedTest(reasonCode: ConnectionFailureCode, checkedUrl: string | null = null) {
  return testResult({
    ok: false,
    latencyMs: reasonCode === ERROR_CODES.VAULT_TEST_TIMEOUT ? null : 380,
    reasonCode,
    checkedUrl,
    models: [],
  })
}

const failureStatus = (code: ConnectionFailureCode) => mockError(HTTP_UNPROCESSABLE, code, code)

function page(items: readonly object[], url: URL) {
  const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
  const start = Number(url.searchParams.get('cursor') ?? 0)
  const next = start + limit < items.length ? String(start + limit) : null
  return mockPage(items.slice(start, start + limit) as never[], next)
}

const SORTS = {
  name: (a: CredentialDto, b: CredentialDto) => a.name.localeCompare(b.name),
  createdAt: (a: CredentialDto, b: CredentialDto) => a.createdAt.localeCompare(b.createdAt),
  lastUsedAt: (a: CredentialDto, b: CredentialDto) =>
    (a.lastUsedAt ?? '').localeCompare(b.lastUsedAt ?? ''),
} as const

function filterCredentials(url: URL, items: CredentialDto[]): CredentialDto[] {
  const q = url.searchParams.get('q')?.toLowerCase()
  const kind = url.searchParams.get('kind')
  const scope = url.searchParams.get('scope')
  const status = url.searchParams.get('status')
  const providerKey = url.searchParams.get('providerKey')
  const teamId = url.searchParams.get('teamId')
  const sort = url.searchParams.get('sort') ?? 'name'
  const field = sort.replace(/^-/, '')
  const compare = Object.hasOwn(SORTS, field) ? SORTS[field as keyof typeof SORTS] : SORTS.name
  return items
    .filter((item) => !q || item.name.toLowerCase().includes(q))
    .filter((item) => !kind || item.kind === kind)
    .filter((item) => !scope || item.scope === scope)
    .filter((item) => (status ? item.status === status : item.status !== 'revoked'))
    .filter((item) => !providerKey || item.providerKey === providerKey)
    .filter((item) => !teamId || item.team?.id === teamId)
    .sort((a, b) => compare(a, b) * (sort.startsWith('-') ? -1 : 1))
}

function cardStatus(
  keyCount: number,
  failing: CredentialDto | undefined,
  expiring: CredentialDto | undefined,
): ProviderCardDto['status'] {
  if (keyCount === 0) return 'not_connected'
  if (failing) return failing.status === 'error' ? 'error' : 'rate_limited'
  return expiring ? 'expiring' : 'connected'
}

/** The provider cards derived from the keys: the worst status of a provider's active keys wins. */
function providerCards(items: CredentialDto[]): ProviderCardDto[] {
  return AI_PROVIDER_KEYS.map((providerKey) => {
    const keys = items.filter(
      (item) =>
        item.kind === 'ai_provider' &&
        item.providerKey === providerKey &&
        item.status !== 'revoked',
    )
    const failing = keys.find((key) => key.status === 'error' || key.status === 'rate_limited')
    const expiring = keys.find((key) => key.expiresAt !== null)
    return {
      providerKey,
      status: cardStatus(keys.length, failing, expiring),
      statusReasonCode: failing?.statusReasonCode ?? null,
      keyCount: keys.length,
      modelCount: keys.length === 0 ? 0 : 2,
      expiresAt: expiring?.expiresAt ?? null,
      fallbackInUse: false,
    }
  })
}

function nextTestResult(input: z.infer<typeof connectionTestInputSchema>): ConnectionTestDto {
  const duplicate = credentials.find(
    (credential) => credential.kind === input.kind && credential.providerKey === input.providerKey,
  )
  const echoesKnownSecret = input.kind === 'ai_provider' && input.secret.endsWith('a1B2')
  return input.kind === 'local_server'
    ? testResult({ models: LOCAL_MODELS, checkedUrl: input.baseUrl, latencyMs: 35 })
    : testResult({
        duplicateOf:
          echoesKnownSecret && duplicate ? { id: duplicate.id, name: duplicate.name } : null,
      })
}

const IMPACT = {
  dependents: [
    { type: 'agent', count: 3 },
    { type: 'flow', count: 1 },
  ],
  listed: [
    { type: 'agent', id: fixtureUuid(60, 1), name: 'Support triage' },
    { type: 'agent', id: fixtureUuid(60, 2), name: 'Refund helper' },
    { type: 'agent', id: fixtureUuid(60, 3), name: 'Sales researcher' },
    { type: 'flow', id: fixtureUuid(61, 1), name: 'Weekly digest' },
  ],
  userCount: 4,
  fallback: { modelKey: 'local/llama3.1:70b', displayName: 'Llama 3.1 70B' },
}
const NO_IMPACT = { dependents: [], listed: [], userCount: 0, fallback: null }

const path = '/orgs/:orgId/vault'
const noContent = () => new Response(null, { status: 204 })
const notFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.VAULT_CREDENTIAL_NOT_FOUND, 'Key not found')
const revoked = () =>
  mockError(HTTP_CONFLICT, ERROR_CODES.VAULT_CREDENTIAL_REVOKED, 'This key was revoked')

type CreateInput = z.infer<typeof createCredentialInputSchema>

/** Stores a new key; a replacement (`rotatesCredentialId`) is not primary and marks the old key. */
function storeCredential(
  input: CreateInput | z.infer<typeof createPersonalCredentialInputSchema>,
  scope: CredentialDto['scope'],
  owner: CredentialDto['owner'],
): CredentialDto {
  const replaced = input.rotatesCredentialId ? findCredential(input.rotatesCredentialId) : undefined
  const team =
    'teamId' in input
      ? ([SUPPORT_TEAM, SALES_TEAM].find(({ id }) => id === input.teamId) ?? null)
      : null
  const created = credentialFactory({
    name: input.name,
    providerKey: input.providerKey,
    scope,
    team,
    owner,
    isPrimary: !replaced,
    baseUrl: input.baseUrl ?? null,
    secretLast4: input.secret.slice(-4),
    expiresAt: input.expiresAt ?? null,
    rotatedFromId: replaced?.id ?? null,
    lastUsedAt: null,
    lastSuccessAt: '2026-10-05T09:00:00.000Z',
    createdAt: '2026-10-05T09:00:00.000Z',
    updatedAt: '2026-10-05T09:00:00.000Z',
  })
  credentials = [
    ...credentials.map((credential) =>
      credential.id === replaced?.id
        ? { ...credential, replacedBy: { id: created.id, name: created.name } }
        : credential,
    ),
    created,
  ]
  return created
}

/**
 * Provider keys, connection tests, local servers and personal keys until the integration task
 * (I4-02) switches to the real API. Scenarios: `degraded` (keys in error, rate limited or expiring
 * and "fallback in use" on the cards); on a test or save `key-invalid`, `quota`, `region`,
 * `test-timeout`, `server-offline`, `duplicate`; `provider-blocked`, `personal-disabled`,
 * `server-in-use`, `no-impact`.
 */
export const vaultDomain = defineMockDomain('vault', [
  defineMockHandler({
    method: 'get',
    path: `${path}/providers`,
    response: okResponse(z.array(providerCardDtoSchema)),
    scenarios: {
      default: () => mockOk(providerCards(credentials)),
      degraded: () =>
        mockOk([
          {
            providerKey: 'openai',
            status: 'error',
            statusReasonCode: ERROR_CODES.VAULT_KEY_INVALID,
            keyCount: 1,
            modelCount: 2,
            expiresAt: null,
            fallbackInUse: true,
          },
          {
            providerKey: 'anthropic',
            status: 'expiring',
            statusReasonCode: null,
            keyCount: 1,
            modelCount: 2,
            expiresAt: new Date(Date.now() + EXPIRING_IN_DAYS * DAY_MS - HOUR_MS).toISOString(),
            fallbackInUse: false,
          },
          {
            providerKey: 'google',
            status: 'rate_limited',
            statusReasonCode: ERROR_CODES.VAULT_QUOTA_EXCEEDED,
            keyCount: 1,
            modelCount: 2,
            expiresAt: null,
            fallbackInUse: false,
          },
          {
            providerKey: 'openai_compatible',
            status: 'not_connected',
            statusReasonCode: null,
            keyCount: 0,
            modelCount: 0,
            expiresAt: null,
            fallbackInUse: false,
          },
        ]),
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/credentials`,
    response: pageResponse(credentialDtoSchema),
    scenarios: {
      default: ({ request }) => {
        const url = new URL(request.url)
        return page(filterCredentials(url, credentials), url)
      },
      degraded: ({ request }) => {
        const url = new URL(request.url)
        const expiresAt = new Date(Date.now() + EXPIRING_IN_DAYS * DAY_MS - HOUR_MS).toISOString()
        const items = [
          credentialFactory({
            name: 'OpenAI production',
            status: 'error',
            statusReasonCode: ERROR_CODES.VAULT_KEY_INVALID,
          }),
          credentialFactory({ name: 'Anthropic for Support', providerKey: 'anthropic', expiresAt }),
          credentialFactory({
            name: 'Gemini key',
            providerKey: 'google',
            status: 'rate_limited',
            statusReasonCode: ERROR_CODES.VAULT_QUOTA_EXCEEDED,
          }),
          credentialFactory({
            name: 'Old Anthropic key',
            providerKey: 'anthropic',
            isPrimary: false,
            status: 'expired',
            expiresAt: '2026-09-01T00:00:00.000Z',
          }),
          credentialFactory({
            name: 'GPU box',
            kind: 'local_server',
            providerKey: 'ollama',
            baseUrl: 'https://gpu.internal:11434',
            secretLast4: null,
            status: 'error',
            statusReasonCode: ERROR_CODES.LOCAL_SERVER_UNREACHABLE,
            lastSuccessAt: '2026-10-04T18:20:00.000Z',
            modelCount: 2,
          }),
        ]
        return page(filterCredentials(url, items), url)
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/connection-tests`,
    response: okResponse(connectionTestDtoSchema),
    scenarios: {
      default: async ({ request }) =>
        mockOk(nextTestResult(connectionTestInputSchema.parse(await request.json()))),
      'key-invalid': () => mockOk(failedTest(ERROR_CODES.VAULT_KEY_INVALID)),
      quota: () => mockOk(failedTest(ERROR_CODES.VAULT_QUOTA_EXCEEDED)),
      region: () => mockOk(failedTest(ERROR_CODES.VAULT_REGION_BLOCKED)),
      'test-timeout': () => mockOk(failedTest(ERROR_CODES.VAULT_TEST_TIMEOUT)),
      'server-offline': async ({ request }) => {
        const input = connectionTestInputSchema.parse(await request.json())
        return mockOk(
          failedTest(
            ERROR_CODES.LOCAL_SERVER_UNREACHABLE,
            input.kind === 'local_server' ? input.baseUrl : null,
          ),
        )
      },
      duplicate: () =>
        mockOk(testResult({ duplicateOf: { id: OPENAI_KEY_ID, name: 'OpenAI production' } })),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/credentials`,
    response: okResponse(credentialDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const input = createCredentialInputSchema.parse(await request.json())
        return mockOk(storeCredential(input, input.scope, null), { status: 201 })
      },
      'key-invalid': () => failureStatus(ERROR_CODES.VAULT_KEY_INVALID),
      quota: () => failureStatus(ERROR_CODES.VAULT_QUOTA_EXCEEDED),
      region: () => failureStatus(ERROR_CODES.VAULT_REGION_BLOCKED),
      'test-timeout': () => failureStatus(ERROR_CODES.VAULT_TEST_TIMEOUT),
      'provider-blocked': () =>
        mockError(
          HTTP_FORBIDDEN,
          ERROR_CODES.VAULT_PROVIDER_NOT_ALLOWED,
          "The access policy doesn't allow this provider",
        ),
    },
  }),
  defineMockHandler({
    method: 'patch',
    path: `${path}/credentials/:credentialId`,
    response: okResponse(credentialDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const found = findCredential(params.credentialId)
        if (!found) return notFound()
        if (found.status === 'revoked') return revoked()
        const input = updateCredentialInputSchema.parse(await request.json())
        const updated = { ...found, ...input, updatedAt: '2026-10-05T09:00:00.000Z' }
        replaceCredential(updated)
        return mockOk(updated)
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/credentials/:credentialId/test`,
    response: okResponse(connectionTestDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findCredential(params.credentialId)
        if (!found) return notFound()
        if (found.status === 'revoked') return revoked()
        replaceCredential({
          ...found,
          status: 'active',
          statusReasonCode: null,
          lastSuccessAt: '2026-10-05T09:00:00.000Z',
          statusCheckedAt: '2026-10-05T09:00:00.000Z',
        })
        return mockOk(
          testResult({ models: found.kind === 'local_server' ? LOCAL_MODELS : AI_MODELS }),
        )
      },
      'key-invalid': ({ params }) => {
        const found = findCredential(params.credentialId)
        if (!found) return notFound()
        replaceCredential({
          ...found,
          status: 'error',
          statusReasonCode: ERROR_CODES.VAULT_KEY_INVALID,
          statusCheckedAt: '2026-10-05T09:00:00.000Z',
        })
        return mockOk(failedTest(ERROR_CODES.VAULT_KEY_INVALID))
      },
      'server-offline': () => mockOk(failedTest(ERROR_CODES.LOCAL_SERVER_UNREACHABLE)),
      'test-timeout': () => mockOk(failedTest(ERROR_CODES.VAULT_TEST_TIMEOUT)),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/credentials/:credentialId/make-primary`,
    response: okResponse(credentialDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findCredential(params.credentialId)
        if (!found) return notFound()
        if (found.status === 'revoked') return revoked()
        credentials = credentials.map((credential) =>
          credential.providerKey === found.providerKey &&
          credential.scope === found.scope &&
          credential.team?.id === found.team?.id &&
          credential.kind === 'ai_provider'
            ? { ...credential, isPrimary: credential.id === found.id }
            : credential,
        )
        return mockOk({ ...found, isPrimary: true })
      },
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/credentials/:credentialId/revoke`,
    response: okResponse(credentialDtoSchema),
    scenarios: {
      default: ({ params }) => {
        const found = findCredential(params.credentialId)
        if (!found) return notFound()
        if (found.status === 'revoked') return revoked()
        const updated: CredentialDto = {
          ...found,
          status: 'revoked',
          isPrimary: false,
          revokedAt: '2026-10-05T09:00:00.000Z',
        }
        replaceCredential(updated)
        return mockOk(updated)
      },
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/credentials/:credentialId/impact`,
    response: okResponse(credentialImpactDtoSchema),
    scenarios: {
      default: ({ params }) => (findCredential(params.credentialId) ? mockOk(IMPACT) : notFound()),
      'no-impact': () => mockOk(NO_IMPACT),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/local-servers`,
    response: okResponse(credentialDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const input = createLocalServerInputSchema.parse(await request.json())
        const created = credentialFactory({
          name: input.name,
          kind: 'local_server',
          providerKey: input.providerKey,
          scope: input.scope,
          team: input.scope === 'team' ? SUPPORT_TEAM : null,
          baseUrl: input.baseUrl,
          secretLast4: input.secret ? input.secret.slice(-4) : null,
          modelCount: LOCAL_MODELS.length,
          lastUsedAt: null,
        })
        credentials = [...credentials, created]
        return mockOk(created, { status: 201 })
      },
      'server-offline': () => failureStatus(ERROR_CODES.LOCAL_SERVER_UNREACHABLE),
      'provider-blocked': () =>
        mockError(
          HTTP_FORBIDDEN,
          ERROR_CODES.VAULT_PROVIDER_NOT_ALLOWED,
          'Local models are turned off for this organization',
        ),
    },
  }),
  defineMockHandler({
    method: 'delete',
    path: `${path}/local-servers/:serverId`,
    response: okResponse(z.null()),
    scenarios: {
      default: ({ params }) => {
        if (!findCredential(params.serverId)) return notFound()
        credentials = credentials.filter((credential) => credential.id !== params.serverId)
        return noContent()
      },
      'server-in-use': () =>
        mockError(
          HTTP_CONFLICT,
          ERROR_CODES.VAULT_SERVER_IN_USE,
          'A model on this server is still in use',
        ),
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/local-servers/:serverId/impact`,
    response: okResponse(credentialImpactDtoSchema),
    scenarios: {
      default: ({ params }) => (findCredential(params.serverId) ? mockOk(IMPACT) : notFound()),
      'no-impact': () => mockOk(NO_IMPACT),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/local-servers/:serverId/sync`,
    response: okResponse(localServerSyncDtoSchema),
    scenarios: {
      default: ({ params }) =>
        findCredential(params.serverId)
          ? mockOk({ models: LOCAL_MODELS, added: 1, removed: 0 })
          : notFound(),
      'server-offline': () => failureStatus(ERROR_CODES.LOCAL_SERVER_UNREACHABLE),
    },
  }),
  defineMockHandler({
    method: 'get',
    path: `${path}/my-credentials`,
    response: pageResponse(credentialDtoSchema),
    scenarios: {
      default: ({ request }) =>
        page(
          credentials.filter(
            (credential) => credential.owner?.id === MAYA.id && credential.status !== 'revoked',
          ),
          new URL(request.url),
        ),
      'personal-disabled': () =>
        mockError(
          HTTP_FORBIDDEN,
          ERROR_CODES.VAULT_PERSONAL_KEYS_DISABLED,
          'Personal keys are turned off',
        ),
    },
  }),
  defineMockHandler({
    method: 'post',
    path: `${path}/my-credentials`,
    response: okResponse(credentialDtoSchema),
    scenarios: {
      default: async ({ request }) => {
        const input = createPersonalCredentialInputSchema.parse(await request.json())
        return mockOk(storeCredential(input, 'personal', MAYA), { status: 201 })
      },
      'personal-disabled': () =>
        mockError(
          HTTP_FORBIDDEN,
          ERROR_CODES.VAULT_PERSONAL_KEYS_DISABLED,
          'Personal keys are turned off',
        ),
      'key-invalid': () => failureStatus(ERROR_CODES.VAULT_KEY_INVALID),
    },
  }),
])
