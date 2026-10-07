// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  credentialImpactDtoSchema,
  DEFAULT_VAULT_FALLBACK,
  ERROR_CODES,
  listModelAccessQuerySchema,
  localModelKey,
  modelAccessEntryDtoSchema,
  modelAccessRuleDtoSchema,
  okResponse,
  pageResponse,
  PAGE_SIZE,
  setModelAccessInputSchema,
  updateVaultModelInputSchema,
  updateVaultSettingsInputSchema,
  usableModelDtoSchema,
  vaultModelDtoSchema,
  vaultSettingsDtoSchema,
} from '@surefy/contracts'
import type {
  FallbackEntryDto,
  ModelAccessRuleDto,
  UsableModelDto,
  VaultFallback,
  VaultModelDto,
  VaultSettingsDto,
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
import { OLLAMA_SERVER_ID } from './vault'

const MODEL_KIND = 51
const RULE_KIND = 52
const HTTP_NOT_FOUND = 404
const HTTP_UNPROCESSABLE = 422

const MICROS_PER_DOLLAR = 1_000_000

/** An enabled, available OpenAI chat model with a price, unless overridden. */
export const vaultModelFactory = defineFactory(vaultModelDtoSchema, (sequence): VaultModelDto => ({
  id: fixtureUuid(MODEL_KIND, sequence),
  modelKey: `openai/model-${sequence}`,
  providerKey: 'openai',
  providerModelId: `model-${sequence}`,
  displayName: `Model ${sequence}`,
  type: 'chat',
  source: 'provider',
  server: null,
  supportsVision: false,
  supportsTools: true,
  contextWindow: 128_000,
  embeddingDimensions: null,
  prices: {
    inputPerMTokMicros: 2 * MICROS_PER_DOLLAR,
    outputPerMTokMicros: 8 * MICROS_PER_DOLLAR,
    cachedInputPerMTokMicros: null,
    currency: 'USD',
  },
  isEnabled: true,
  status: 'available',
  lastSeenAt: '2026-10-05T03:00:00.000Z',
  createdAt: '2026-01-05T09:00:00.000Z',
  updatedAt: '2026-01-05T09:00:00.000Z',
}))

export const GPT_MODEL_ID = fixtureUuid(MODEL_KIND, 1)
export const MINI_MODEL_ID = fixtureUuid(MODEL_KIND, 2)
export const CLAUDE_MODEL_ID = fixtureUuid(MODEL_KIND, 3)
export const EMBEDDING_MODEL_ID = fixtureUuid(MODEL_KIND, 4)
export const LLAMA_MODEL_ID = fixtureUuid(MODEL_KIND, 5)
export const NOMIC_MODEL_ID = fixtureUuid(MODEL_KIND, 6)

const OLLAMA_SERVER = { id: OLLAMA_SERVER_ID, name: 'GPU box' }
const SUPPORT_TEAM = { id: SUPPORT_TEAM_ID, name: 'Support' }
const SALES_TEAM = { id: SALES_TEAM_ID, name: 'Sales' }

function seedModels(): VaultModelDto[] {
  vaultModelFactory.reset()
  return [
    vaultModelFactory({
      modelKey: 'openai/gpt-4.1',
      providerModelId: 'gpt-4.1',
      displayName: 'GPT-4.1',
      supportsVision: true,
      contextWindow: 1_000_000,
    }),
    vaultModelFactory({
      modelKey: 'openai/gpt-4.1-mini',
      providerModelId: 'gpt-4.1-mini',
      displayName: 'GPT-4.1 mini',
      supportsVision: true,
      prices: {
        inputPerMTokMicros: 400_000,
        outputPerMTokMicros: 1_600_000,
        cachedInputPerMTokMicros: null,
        currency: 'USD',
      },
    }),
    vaultModelFactory({
      modelKey: 'anthropic/claude-sonnet-4',
      providerKey: 'anthropic',
      providerModelId: 'claude-sonnet-4',
      displayName: 'Claude Sonnet 4',
      supportsVision: true,
      contextWindow: 200_000,
      prices: {
        inputPerMTokMicros: 3 * MICROS_PER_DOLLAR,
        outputPerMTokMicros: 15 * MICROS_PER_DOLLAR,
        cachedInputPerMTokMicros: null,
        currency: 'USD',
      },
    }),
    vaultModelFactory({
      modelKey: 'openai/text-embedding-3-small',
      providerModelId: 'text-embedding-3-small',
      displayName: 'Text embedding 3 small',
      type: 'embedding',
      supportsTools: false,
      contextWindow: 8191,
      embeddingDimensions: 1536,
      prices: {
        inputPerMTokMicros: 20_000,
        outputPerMTokMicros: null,
        cachedInputPerMTokMicros: null,
        currency: 'USD',
      },
    }),
    vaultModelFactory({
      modelKey: localModelKey(OLLAMA_SERVER_ID, 'llama3.1:70b'),
      providerKey: 'ollama',
      providerModelId: 'llama3.1:70b',
      displayName: 'llama3.1:70b',
      source: 'local',
      server: OLLAMA_SERVER,
      contextWindow: 131_072,
      prices: {
        inputPerMTokMicros: null,
        outputPerMTokMicros: null,
        cachedInputPerMTokMicros: null,
        currency: 'USD',
      },
    }),
    vaultModelFactory({
      modelKey: localModelKey(OLLAMA_SERVER_ID, 'nomic-embed-text'),
      providerKey: 'ollama',
      providerModelId: 'nomic-embed-text',
      displayName: 'nomic-embed-text',
      type: 'embedding',
      source: 'local',
      server: OLLAMA_SERVER,
      supportsTools: false,
      embeddingDimensions: 768,
      isEnabled: false,
      prices: {
        inputPerMTokMicros: null,
        outputPerMTokMicros: null,
        cachedInputPerMTokMicros: null,
        currency: 'USD',
      },
    }),
  ]
}

function rule(
  sequence: number,
  subject: Pick<ModelAccessRuleDto, 'subjectType' | 'team' | 'user'>,
): ModelAccessRuleDto {
  return { id: fixtureUuid(RULE_KIND, sequence), createdAt: '2026-01-06T09:00:00.000Z', ...subject }
}

const ORGANIZATION = { subjectType: 'organization', team: null, user: null } as const

function seedRules(): Map<string, ModelAccessRuleDto[]> {
  return new Map([
    [GPT_MODEL_ID, [rule(1, ORGANIZATION)]],
    [
      MINI_MODEL_ID,
      [
        rule(2, { subjectType: 'team', team: SALES_TEAM, user: null }),
        rule(3, { subjectType: 'user', team: null, user: OMAR }),
      ],
    ],
    [CLAUDE_MODEL_ID, [rule(4, { subjectType: 'team', team: SUPPORT_TEAM, user: null })]],
    [EMBEDDING_MODEL_ID, [rule(5, ORGANIZATION)]],
    [LLAMA_MODEL_ID, [rule(6, ORGANIZATION)]],
  ])
}

const seedFallback = (): VaultFallback => ({
  ...DEFAULT_VAULT_FALLBACK,
  order: ['openai/gpt-4.1', localModelKey(OLLAMA_SERVER_ID, 'llama3.1:70b')],
  timeoutSeconds: 30,
})

let models = seedModels()
let rules = seedRules()
let embeddingModelId: string | null = EMBEDDING_MODEL_ID
let fallback = seedFallback()
let ruleSequence = 100

/** Back to the seeded models, rules and settings; tests call it between cases. */
export function resetModelsMock(): void {
  models = seedModels()
  rules = seedRules()
  embeddingModelId = EMBEDDING_MODEL_ID
  fallback = seedFallback()
  ruleSequence = 100
}

const findModel = (id: unknown) => models.find((model) => model.id === id)
const replaceModel = (updated: VaultModelDto) => {
  models = models.map((model) => (model.id === updated.id ? updated : model))
}

function page(items: readonly object[], url: URL) {
  const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE.default)
  const start = Number(url.searchParams.get('cursor') ?? 0)
  const next = start + limit < items.length ? String(start + limit) : null
  return mockPage(items.slice(start, start + limit) as never[], next)
}

function costTier(model: VaultModelDto): UsableModelDto['costTier'] {
  if (model.source !== 'provider') return 'free'
  const price = model.prices.outputPerMTokMicros ?? model.prices.inputPerMTokMicros
  if (price === null) return 'unknown'
  if (price <= 2 * MICROS_PER_DOLLAR) return 'low'
  return price <= 8 * MICROS_PER_DOLLAR ? 'medium' : 'high'
}

function toUsable(model: VaultModelDto): UsableModelDto {
  return {
    modelKey: model.modelKey,
    displayName: model.displayName,
    providerKey: model.providerKey,
    type: model.type,
    source: model.source,
    dataLocation: model.source === 'provider' ? 'sent_to_provider' : 'on_server',
    costTier: costTier(model),
    supportsVision: model.supportsVision,
    supportsTools: model.supportsTools,
    contextWindow: model.contextWindow,
  }
}

function isUsable(model: VaultModelDto): boolean {
  return model.isEnabled && model.status === 'available' && (rules.get(model.id)?.length ?? 0) > 0
}

function fallbackState(model: VaultModelDto | undefined): FallbackEntryDto['state'] {
  if (!model) return 'missing'
  if (!model.isEnabled) return 'disabled'
  return model.status === 'available' ? 'ready' : 'unavailable'
}

function fallbackEntries(order: readonly string[]): FallbackEntryDto[] {
  return order.map((modelKey) => {
    const model = models.find((candidate) => candidate.modelKey === modelKey)
    return { modelKey, displayName: model?.displayName ?? null, state: fallbackState(model) }
  })
}

function settingsDto(): VaultSettingsDto {
  const embedding = models.find((model) => model.id === embeddingModelId)
  return {
    embeddingModel: embedding
      ? {
          id: embedding.id,
          modelKey: embedding.modelKey,
          displayName: embedding.displayName,
          dimensions: embedding.embeddingDimensions,
        }
      : null,
    fallback,
    fallbackEntries: fallbackEntries(fallback.order),
    updatedByUserId: MAYA.id,
    updatedAt: '2026-10-05T09:00:00.000Z',
  }
}

function applyRules(
  modelId: string,
  subjects: z.infer<typeof setModelAccessInputSchema>['rules'],
): ModelAccessRuleDto[] {
  const next = subjects.map((subject): ModelAccessRuleDto => {
    ruleSequence += 1
    if (subject.subjectType === 'organization') return rule(ruleSequence, ORGANIZATION)
    if (subject.subjectType === 'team') {
      const team = subject.teamId === SALES_TEAM_ID ? SALES_TEAM : SUPPORT_TEAM
      return rule(ruleSequence, { subjectType: 'team', team, user: null })
    }
    const user = subject.userId === OMAR.id ? OMAR : MAYA
    return rule(ruleSequence, { subjectType: 'user', team: null, user })
  })
  rules.set(modelId, next)
  return next
}

const IMPACT = {
  dependents: [
    { type: 'agent', count: 2 },
    { type: 'knowledge_base', count: 1 },
  ],
  listed: [
    { type: 'agent', id: fixtureUuid(60, 1), name: 'Support triage' },
    { type: 'agent', id: fixtureUuid(60, 2), name: 'Refund helper' },
    { type: 'knowledge_base', id: fixtureUuid(62, 1), name: 'Help center' },
  ],
  userCount: 3,
  fallback: { modelKey: 'openai/gpt-4.1', displayName: 'GPT-4.1' },
}
const NO_IMPACT = { dependents: [], listed: [], userCount: 0, fallback: null }

const path = '/orgs/:orgId'
const notFound = () => mockError(HTTP_NOT_FOUND, ERROR_CODES.MODEL_NOT_FOUND, 'Model not found')

/** Models still listed after a sync stopped finding one of them. */
const removedUpstream = (): VaultModelDto =>
  vaultModelFactory({
    modelKey: 'openai/gpt-3.5-turbo',
    providerModelId: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    status: 'removed_upstream',
  })

/**
 * The models a person may use and the Vault's model management (B3-01's routes), live on the real
 * API (I4-02; the handlers stay for component tests and for `MOCK_DOMAINS=models`, to look at the
 * states). Scenarios: `removed-upstream` adds a model the provider no longer lists to the model
 * list; `no-embedding` clears the embedding model and the fallback order; `embedding-invalid` and
 * `server-offline` fail a settings save.
 */
export const modelsDomain = defineMockDomain(
  'models',
  [
    defineMockHandler({
      method: 'get',
      path: `${path}/models`,
      response: pageResponse(usableModelDtoSchema),
      scenarios: {
        default: ({ request }) => {
          const url = new URL(request.url)
          const q = url.searchParams.get('q')?.toLowerCase()
          const type = url.searchParams.get('type')
          const source = url.searchParams.get('source')
          return page(
            models
              .filter(isUsable)
              .filter((model) => !q || model.displayName.toLowerCase().includes(q))
              .filter((model) => !type || model.type === type)
              .filter((model) => !source || model.source === source)
              .map(toUsable),
            url,
          )
        },
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/vault/models`,
      response: pageResponse(vaultModelDtoSchema),
      scenarios: {
        default: ({ request }) => {
          const url = new URL(request.url)
          return page(filterModels(url, models), url)
        },
        'removed-upstream': ({ request }) => {
          const url = new URL(request.url)
          return page(filterModels(url, [...models, removedUpstream()]), url)
        },
      },
    }),
    defineMockHandler({
      method: 'patch',
      path: `${path}/vault/models/:modelId`,
      response: okResponse(vaultModelDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          const found = findModel(params.modelId)
          if (!found) return notFound()
          const input = updateVaultModelInputSchema.parse(await request.json())
          const updated: VaultModelDto = {
            ...found,
            isEnabled: input.isEnabled ?? found.isEnabled,
            updatedAt: '2026-10-05T09:00:00.000Z',
          }
          replaceModel(updated)
          if (input.access) applyRules(found.id, input.access.rules)
          else if (updated.isEnabled && !found.isEnabled && !rules.get(found.id)?.length) {
            // the first time a model is enabled it is offered to the whole organization
            applyRules(found.id, [{ subjectType: 'organization' }])
          }
          return mockOk(updated)
        },
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/vault/models/:modelId/impact`,
      response: okResponse(credentialImpactDtoSchema),
      scenarios: {
        default: ({ params }) => (findModel(params.modelId) ? mockOk(IMPACT) : notFound()),
        'no-impact': () => mockOk(NO_IMPACT),
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/vault/model-access`,
      response: pageResponse(modelAccessEntryDtoSchema),
      scenarios: {
        default: ({ request }) => {
          const url = new URL(request.url)
          const query = listModelAccessQuerySchema.parse(
            Object.fromEntries(url.searchParams.entries()),
          )
          return page(
            models
              .filter(
                (model) =>
                  !query.q || model.displayName.toLowerCase().includes(query.q.toLowerCase()),
              )
              .filter((model) => !query.type || query.type.includes(model.type))
              .filter(
                (model) => query.isEnabled === undefined || model.isEnabled === query.isEnabled,
              )
              .map((model) => ({
                modelId: model.id,
                modelKey: model.modelKey,
                displayName: model.displayName,
                providerKey: model.providerKey,
                type: model.type,
                isEnabled: model.isEnabled,
                rules: rules.get(model.id) ?? [],
              })),
            url,
          )
        },
      },
    }),
    defineMockHandler({
      method: 'put',
      path: `${path}/vault/models/:modelId/access`,
      response: okResponse(z.array(modelAccessRuleDtoSchema)),
      scenarios: {
        default: async ({ params, request }) => {
          if (!findModel(params.modelId)) return notFound()
          const input = setModelAccessInputSchema.parse(await request.json())
          return mockOk(applyRules(String(params.modelId), input.rules))
        },
      },
    }),
    defineMockHandler({
      method: 'get',
      path: `${path}/vault/settings`,
      response: okResponse(vaultSettingsDtoSchema),
      scenarios: {
        default: () => mockOk(settingsDto()),
        'no-embedding': () =>
          mockOk({
            ...settingsDto(),
            embeddingModel: null,
            fallback: DEFAULT_VAULT_FALLBACK,
            fallbackEntries: [],
          }),
      },
    }),
    defineMockHandler({
      method: 'put',
      path: `${path}/vault/settings`,
      response: okResponse(vaultSettingsDtoSchema),
      scenarios: {
        default: async ({ request }) => {
          const input = updateVaultSettingsInputSchema.parse(await request.json())
          if (typeof input.embeddingModelId === 'string') {
            const chosen = findModel(input.embeddingModelId)
            if (chosen?.type !== 'embedding' || !chosen.isEnabled) {
              return mockError(
                HTTP_UNPROCESSABLE,
                ERROR_CODES.MODEL_EMBEDDING_INVALID,
                'Choose an enabled embedding model',
              )
            }
          }
          if (input.embeddingModelId !== undefined) embeddingModelId = input.embeddingModelId
          if (input.fallback) fallback = input.fallback
          return mockOk(settingsDto())
        },
        'embedding-invalid': () =>
          mockError(
            HTTP_UNPROCESSABLE,
            ERROR_CODES.MODEL_EMBEDDING_INVALID,
            'Choose an enabled embedding model',
          ),
      },
    }),
  ],
  { isLive: true },
)

function filterModels(url: URL, items: VaultModelDto[]): VaultModelDto[] {
  const q = url.searchParams.get('q')?.toLowerCase()
  const type = url.searchParams.get('type')
  const source = url.searchParams.get('source')
  const status = url.searchParams.get('status')
  const providerKey = url.searchParams.get('providerKey')
  const serverId = url.searchParams.get('serverId')
  const isEnabled = url.searchParams.get('isEnabled')
  const sort = url.searchParams.get('sort') ?? 'displayName'
  const direction = sort.startsWith('-') ? -1 : 1
  return items
    .filter((model) => !q || model.displayName.toLowerCase().includes(q))
    .filter((model) => !type || model.type === type)
    .filter((model) => !source || model.source === source)
    .filter((model) => !status || model.status === status)
    .filter((model) => !providerKey || model.providerKey === providerKey)
    .filter((model) => !serverId || model.server?.id === serverId)
    .filter((model) => isEnabled === null || String(model.isEnabled) === isEnabled)
    .sort((a, b) =>
      sort.endsWith('createdAt')
        ? a.createdAt.localeCompare(b.createdAt) * direction
        : a.displayName.localeCompare(b.displayName) * direction,
    )
}
