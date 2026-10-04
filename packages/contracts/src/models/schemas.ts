// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  MODEL_PICKER_SOURCES,
  MODEL_TYPES,
  VAULT_MODEL_SOURCES,
  VAULT_MODEL_STATUSES,
  modelKeySchema,
} from './keys.js'
import { userRefDtoSchema } from '../auth/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'
import { teamRefDtoSchema } from '../teams/schemas.js'
import { providerKeySchema } from '../vault/providers.js'
import { credentialImpactDtoSchema } from '../vault/schemas.js'

// The models an organization can call, who may use them, and the embedding model and fallback order
// (database/vault-and-models.md §3–5; Settings › Vault › Local models and Model access, Fallback,
// Chat › model picker). Routes, under /api/v1/orgs/:orgId:
// GET /models (the models the caller may use) ·
// GET /vault/models · GET/PATCH /vault/models/:modelId · GET …/:modelId/impact ·
// GET/PUT /vault/models/:modelId/access · GET /vault/model-access ·
// GET/PUT /vault/settings.

const microsSchema = z.number().int().nonnegative()

/** Per million tokens, integer micros of `currency`; null = price unknown (metered as 0 and flagged in Insights). */
export const modelPricesDtoSchema = z.object({
  inputPerMTokMicros: microsSchema.nullable(),
  outputPerMTokMicros: microsSchema.nullable(),
  cachedInputPerMTokMicros: microsSchema.nullable(),
  currency: z.string().length(3),
})
export type ModelPricesDto = z.infer<typeof modelPricesDtoSchema>

/** `vault_models`: a model the organization can call. */
export const vaultModelDtoSchema = z.object({
  id: z.uuid(),
  modelKey: modelKeySchema,
  providerKey: z.string(),
  providerModelId: z.string(),
  displayName: z.string(),
  type: z.enum(MODEL_TYPES),
  source: z.enum(VAULT_MODEL_SOURCES),
  /** The local server serving the model; null for provider and trained models. */
  server: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  supportsVision: z.boolean(),
  supportsTools: z.boolean(),
  contextWindow: z.number().int().positive().nullable(),
  embeddingDimensions: z.number().int().positive().nullable(),
  prices: modelPricesDtoSchema,
  /** The admin switch; disabling a model in use is T2. */
  isEnabled: z.boolean(),
  /** `removed_upstream` shows "No longer offered by {provider}". */
  status: z.enum(VAULT_MODEL_STATUSES),
  lastSeenAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type VaultModelDto = z.infer<typeof vaultModelDtoSchema>

export const modelParamsSchema = orgParamsSchema.extend({ modelId: z.uuid() })
export type ModelParams = z.infer<typeof modelParamsSchema>

export const VAULT_MODEL_SORT_FIELDS = ['displayName', 'createdAt'] as const

export const listVaultModelsQuerySchema = pageQuery.extend({
  q: searchQuery,
  type: multiValueQuery(z.enum(MODEL_TYPES)),
  source: multiValueQuery(z.enum(VAULT_MODEL_SOURCES)),
  status: multiValueQuery(z.enum(VAULT_MODEL_STATUSES)),
  providerKey: providerKeySchema.optional(),
  /** Models of one local server. */
  serverId: z.uuid().optional(),
  isEnabled: z.stringbool().optional(),
  sort: sortQuery(VAULT_MODEL_SORT_FIELDS),
})
export type ListVaultModelsQuery = z.infer<typeof listVaultModelsQuerySchema>

// ── Model access ────────────────────────────────────────────────────────────────────────────────

export const MODEL_ACCESS_SUBJECT_TYPES = ['organization', 'team', 'user'] as const
export type ModelAccessSubjectType = (typeof MODEL_ACCESS_SUBJECT_TYPES)[number]

/** A rule grants one model to the whole organization, a team or a person; rules only grant. */
export const modelAccessRuleDtoSchema = z.object({
  id: z.uuid(),
  subjectType: z.enum(MODEL_ACCESS_SUBJECT_TYPES),
  team: teamRefDtoSchema.nullable(),
  user: userRefDtoSchema.nullable(),
  createdAt: z.iso.datetime(),
})
export type ModelAccessRuleDto = z.infer<typeof modelAccessRuleDtoSchema>

export const MODEL_ACCESS_RULES_MAX = 200

export const modelAccessSubjectInputSchema = z.discriminatedUnion('subjectType', [
  z.object({ subjectType: z.literal('organization') }),
  z.object({ subjectType: z.literal('team'), teamId: z.uuid() }),
  z.object({ subjectType: z.literal('user'), userId: z.uuid() }),
])
export type ModelAccessSubjectInput = z.infer<typeof modelAccessSubjectInputSchema>

/** `PUT …/models/:modelId/access`: replaces the model's rules; an empty list allows nobody. */
export const setModelAccessInputSchema = z.object({
  rules: z.array(modelAccessSubjectInputSchema).max(MODEL_ACCESS_RULES_MAX),
})
export type SetModelAccessInput = z.infer<typeof setModelAccessInputSchema>

/**
 * `PATCH …/models/:modelId`. Enabling a model for the first time adds an `organization` rule unless
 * `access` is sent in the same request (the Admin picked teams or people in the same dialog).
 */
export const updateVaultModelInputSchema = z.object({
  isEnabled: z.boolean().optional(),
  access: setModelAccessInputSchema.optional(),
})
export type UpdateVaultModelInput = z.infer<typeof updateVaultModelInputSchema>

/** One row of the Model access tab and its matrix view. */
export const modelAccessEntryDtoSchema = z.object({
  modelId: z.uuid(),
  modelKey: modelKeySchema,
  displayName: z.string(),
  providerKey: z.string(),
  type: z.enum(MODEL_TYPES),
  isEnabled: z.boolean(),
  rules: z.array(modelAccessRuleDtoSchema),
})
export type ModelAccessEntryDto = z.infer<typeof modelAccessEntryDtoSchema>

export const listModelAccessQuerySchema = pageQuery.extend({
  q: searchQuery,
  type: multiValueQuery(z.enum(MODEL_TYPES)),
  isEnabled: z.stringbool().optional(),
})
export type ListModelAccessQuery = z.infer<typeof listModelAccessQuerySchema>

export const MODEL_IMPACT_ACTIONS = ['disable', 'remove-access'] as const
export type ModelImpactAction = (typeof MODEL_IMPACT_ACTIONS)[number]

/** `GET …/models/:modelId/impact`; `teamId` narrows `remove-access` to one team's rule. */
export const modelImpactQuerySchema = z.object({
  action: z.enum(MODEL_IMPACT_ACTIONS),
  teamId: z.uuid().optional(),
})
export type ModelImpactQuery = z.infer<typeof modelImpactQuerySchema>

/** Agents, flows, knowledge bases and people that depend on the model; same shape as a key's impact. */
export const modelImpactDtoSchema = credentialImpactDtoSchema
export type ModelImpactDto = z.infer<typeof modelImpactDtoSchema>

// ── Settings: embedding model and fallback ──────────────────────────────────────────────────────

export const FALLBACK_ORDER_MAX = 50
export const FALLBACK_TIMEOUT_SECONDS = { min: 1, max: 600 } as const

/** `VaultFallback` v1 (`vault_settings.fallback`). */
export const vaultFallbackSchema = z.object({
  version: z.literal(1),
  /** Model keys in fallback order; no model twice. */
  order: z
    .array(modelKeySchema)
    .max(FALLBACK_ORDER_MAX)
    .refine((order) => new Set(order).size === order.length),
  /** Fall back when the provider returns an error. */
  onProviderError: z.boolean(),
  /** Fall back when no first token arrives within N seconds; null = no timeout. */
  timeoutSeconds: z
    .number()
    .int()
    .min(FALLBACK_TIMEOUT_SECONDS.min)
    .max(FALLBACK_TIMEOUT_SECONDS.max)
    .nullable(),
  /** Locked on: private chats only ever use local models. */
  privateChatsLocalOnly: z.literal(true),
})
export type VaultFallback = z.infer<typeof vaultFallbackSchema>

export const DEFAULT_VAULT_FALLBACK: VaultFallback = {
  version: 1,
  order: [],
  onProviderError: true,
  timeoutSeconds: null,
  privateChatsLocalOnly: true,
}

/** What the gateway does with a fallback entry; the Fallback tab marks the ones it skips. */
export const FALLBACK_ENTRY_STATES = ['ready', 'disabled', 'unavailable', 'missing'] as const
export type FallbackEntryState = (typeof FALLBACK_ENTRY_STATES)[number]

export const fallbackEntryDtoSchema = z.object({
  modelKey: modelKeySchema,
  /** Null when no model has this key any more (`missing`). */
  displayName: z.string().nullable(),
  state: z.enum(FALLBACK_ENTRY_STATES),
})
export type FallbackEntryDto = z.infer<typeof fallbackEntryDtoSchema>

/** `GET …/vault/settings`: with the order resolved against the current models for the live "requests go to…" preview. */
export const vaultSettingsDtoSchema = z.object({
  /** The default for knowledge bases created afterwards; null shows "Knowledge uploads need an embedding model". */
  embeddingModel: z
    .object({
      id: z.uuid(),
      modelKey: modelKeySchema,
      displayName: z.string(),
      dimensions: z.number().int().positive().nullable(),
    })
    .nullable(),
  fallback: vaultFallbackSchema,
  fallbackEntries: z.array(fallbackEntryDtoSchema).max(FALLBACK_ORDER_MAX),
  updatedByUserId: z.uuid().nullable(),
  updatedAt: z.iso.datetime(),
})
export type VaultSettingsDto = z.infer<typeof vaultSettingsDtoSchema>

/** `PUT …/vault/settings`; an absent field stays as it is. The embedding model must be an enabled embedding model. */
export const updateVaultSettingsInputSchema = z.object({
  embeddingModelId: z.uuid().nullable().optional(),
  fallback: vaultFallbackSchema.optional(),
})
export type UpdateVaultSettingsInput = z.infer<typeof updateVaultSettingsInputSchema>

// ── The picker: models the caller may use ───────────────────────────────────────────────────────

/** Where the data goes: `local` and `trained` stay on the customer's server, the rest is sent to a provider. */
export const MODEL_DATA_LOCATIONS = ['on_server', 'sent_to_provider'] as const
export type ModelDataLocation = (typeof MODEL_DATA_LOCATIONS)[number]

/** Relative price bucket chosen by the server from the prices; local models are `free`. */
export const MODEL_COST_TIERS = ['free', 'low', 'medium', 'high', 'unknown'] as const
export type ModelCostTier = (typeof MODEL_COST_TIERS)[number]

/**
 * A model the caller may use (enabled, available, allowed by a rule and within effective access):
 * the Chat picker and the Builder's read-only Vault list. Platform models (Cloud) appear here too.
 */
export const usableModelDtoSchema = z.object({
  modelKey: modelKeySchema,
  displayName: z.string(),
  providerKey: z.string(),
  type: z.enum(MODEL_TYPES),
  source: z.enum(MODEL_PICKER_SOURCES),
  dataLocation: z.enum(MODEL_DATA_LOCATIONS),
  costTier: z.enum(MODEL_COST_TIERS),
  supportsVision: z.boolean(),
  supportsTools: z.boolean(),
  contextWindow: z.number().int().positive().nullable(),
})
export type UsableModelDto = z.infer<typeof usableModelDtoSchema>

export const listUsableModelsQuerySchema = pageQuery.extend({
  q: searchQuery,
  type: z.enum(MODEL_TYPES).optional(),
  source: multiValueQuery(z.enum(MODEL_PICKER_SOURCES)),
})
export type ListUsableModelsQuery = z.infer<typeof listUsableModelsQuerySchema>
