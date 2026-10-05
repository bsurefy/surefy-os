// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { VAULT_ERROR_CODES } from './errors.js'
import {
  baseUrlSchema,
  CREDENTIAL_KINDS,
  CREDENTIAL_SCOPES,
  CREDENTIAL_STATUSES,
  credentialNameSchema,
  LOCAL_SERVER_PROVIDER_KEYS,
  providerKeySchema,
  secretSchema,
} from './providers.js'
import { userRefDtoSchema } from '../auth/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'
import { MODEL_TYPES } from '../models/keys.js'
import { teamRefDtoSchema } from '../teams/schemas.js'

// Provider keys, local servers and the key lifecycle (database/vault-and-models.md §2; Settings ›
// Vault › Providers & keys and Local models, Profile › API keys). Routes, all under
// /api/v1/orgs/:orgId/vault:
// GET /providers · GET/POST /credentials · POST /connection-tests ·
// GET/PATCH /credentials/:credentialId · GET …/:credentialId/impact ·
// POST …/:credentialId/{test,make-primary,revoke} ·
// GET/POST /local-servers · DELETE /local-servers/:serverId · GET …/:serverId/impact ·
// POST …/:serverId/sync · GET/POST /my-credentials.
// Secrets travel only in create and test requests; no response carries one. Save runs the connection
// test itself and answers with the failure code when it does not pass, so a key is never stored untested.

/** Time the server waits for a provider or local server to answer a connection test. */
export const CONNECTION_TEST_TIMEOUT_SECONDS = 20

/** Why a test or a call failed; also what `status_reason_code` holds (all values are API error codes). */
export const CONNECTION_FAILURE_CODES = [
  VAULT_ERROR_CODES.VAULT_KEY_INVALID,
  VAULT_ERROR_CODES.VAULT_QUOTA_EXCEEDED,
  VAULT_ERROR_CODES.VAULT_REGION_BLOCKED,
  VAULT_ERROR_CODES.VAULT_TEST_TIMEOUT,
  VAULT_ERROR_CODES.LOCAL_SERVER_UNREACHABLE,
] as const
export type ConnectionFailureCode = (typeof CONNECTION_FAILURE_CODES)[number]
export const connectionFailureCodeSchema = z.enum(CONNECTION_FAILURE_CODES)

const microsSchema = z.number().int().nonnegative()
const currencySchema = z.string().length(3)

/** Spend this month per currency (sum of `usage_daily.cost_micros`); never stored. Local servers have none. */
export const credentialSpendDtoSchema = z.object({
  currency: currencySchema,
  costMicros: microsSchema,
})
export type CredentialSpendDto = z.infer<typeof credentialSpendDtoSchema>

/**
 * A provider key or local server as the keys table shows it. `secretLast4` is the masked value and
 * is null for another person's personal key and for kinds without a secret; the secret itself is
 * never returned. `modelCount` is set for local servers only.
 */
export const credentialDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(CREDENTIAL_KINDS),
  providerKey: z.string(),
  scope: z.enum(CREDENTIAL_SCOPES),
  team: teamRefDtoSchema.nullable(),
  /** The owner of a personal key. */
  owner: userRefDtoSchema.nullable(),
  /** The key the gateway uses for this provider and scope. */
  isPrimary: z.boolean(),
  baseUrl: z.string().nullable(),
  secretLast4: z.string().nullable(),
  status: z.enum(CREDENTIAL_STATUSES),
  statusReasonCode: connectionFailureCodeSchema.nullable(),
  statusCheckedAt: z.iso.datetime().nullable(),
  /** Last successful call or test; the "last successful contact" of an offline local server. */
  lastSuccessAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  /** The key this one replaces (rotation step 1). */
  rotatedFromId: z.uuid().nullable(),
  /** The key that replaces this one: "Replaced by {name}" with Revoke. */
  replacedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdBy: userRefDtoSchema.nullable(),
  revokedAt: z.iso.datetime().nullable(),
  spendThisMonth: z.array(credentialSpendDtoSchema),
  modelCount: z.number().int().nonnegative().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type CredentialDto = z.infer<typeof credentialDtoSchema>

export const credentialParamsSchema = orgParamsSchema.extend({ credentialId: z.uuid() })
export type CredentialParams = z.infer<typeof credentialParamsSchema>

export const localServerParamsSchema = orgParamsSchema.extend({ serverId: z.uuid() })
export type LocalServerParams = z.infer<typeof localServerParamsSchema>

/** `GET …/providers` cards: Connected, Error, Rate limited, Key expires in N days, Not connected. */
export const PROVIDER_CARD_STATUSES = [
  'connected',
  'error',
  'rate_limited',
  'expiring',
  'not_connected',
] as const
export type ProviderCardStatus = (typeof PROVIDER_CARD_STATUSES)[number]

/** Days before `expiresAt` that a key counts as expiring (the warning and the notification). */
export const KEY_EXPIRY_WARNING_DAYS = 14

export const providerCardDtoSchema = z.object({
  providerKey: providerKeySchema,
  status: z.enum(PROVIDER_CARD_STATUSES),
  statusReasonCode: connectionFailureCodeSchema.nullable(),
  /** Non-revoked keys of this provider, any scope. */
  keyCount: z.number().int().nonnegative(),
  modelCount: z.number().int().nonnegative(),
  /** The soonest `expiresAt` among its active keys. */
  expiresAt: z.iso.datetime().nullable(),
  /** Requests for this provider's models are being rerouted by the fallback order. */
  fallbackInUse: z.boolean(),
})
export type ProviderCardDto = z.infer<typeof providerCardDtoSchema>

export const CREDENTIAL_SORT_FIELDS = ['name', 'createdAt', 'lastUsedAt'] as const

export const listCredentialsQuerySchema = pageQuery.extend({
  q: searchQuery,
  kind: multiValueQuery(z.enum(CREDENTIAL_KINDS)),
  scope: multiValueQuery(z.enum(CREDENTIAL_SCOPES)),
  status: multiValueQuery(z.enum(CREDENTIAL_STATUSES)),
  providerKey: providerKeySchema.optional(),
  teamId: z.uuid().optional(),
  sort: sortQuery(CREDENTIAL_SORT_FIELDS),
})
export type ListCredentialsQuery = z.infer<typeof listCredentialsQuerySchema>

// ── Connection test ─────────────────────────────────────────────────────────────────────────────

const aiProviderConnectionSchema = z.object({
  kind: z.literal('ai_provider'),
  providerKey: providerKeySchema,
  secret: secretSchema,
  /** Optional for `openai_compatible` and proxies. */
  baseUrl: baseUrlSchema.optional(),
})

const localServerConnectionSchema = z.object({
  kind: z.literal('local_server'),
  providerKey: z.enum(LOCAL_SERVER_PROVIDER_KEYS),
  baseUrl: baseUrlSchema,
  secret: secretSchema.optional(),
})

/** `POST …/connection-tests`: tries a connection before anything is saved (V1 adds search providers). */
export const connectionTestInputSchema = z.discriminatedUnion('kind', [
  aiProviderConnectionSchema,
  localServerConnectionSchema,
])
export type ConnectionTestInput = z.infer<typeof connectionTestInputSchema>

/** A model the provider or server listed during a test or sync. */
export const detectedModelDtoSchema = z.object({
  providerModelId: z.string().min(1),
  displayName: z.string(),
  type: z.enum(MODEL_TYPES),
  /** In the effective catalog: provider models that are start enabled; others start disabled. */
  inCatalog: z.boolean(),
})
export type DetectedModelDto = z.infer<typeof detectedModelDtoSchema>

/** A failed test is a normal answer (`ok: false` with the provider's reason), not an HTTP error. */
export const connectionTestDtoSchema = z.object({
  ok: z.boolean(),
  /** Round trip of the test call; null when nothing answered. */
  latencyMs: z.number().int().nonnegative().nullable(),
  reasonCode: connectionFailureCodeSchema.nullable(),
  /** The URL checked (local servers), so "Server offline" can show it. */
  checkedUrl: z.string().nullable(),
  /** Models available with this key or on this server; empty on failure. */
  models: z.array(detectedModelDtoSchema).max(1000),
  /** The same key is already stored (matched by fingerprint); a warning, not an error. */
  duplicateOf: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  testedAt: z.iso.datetime(),
})
export type ConnectionTestDto = z.infer<typeof connectionTestDtoSchema>

// ── Add, rotate, update ─────────────────────────────────────────────────────────────────────────

const aiKeyBaseShape = {
  name: credentialNameSchema,
  providerKey: providerKeySchema,
  secret: secretSchema,
  baseUrl: baseUrlSchema.optional(),
  /** Provider-side expiry when known; drives the "Key expiring" warning. */
  expiresAt: z.iso.datetime().optional(),
  /** Rotation step 1: the key this one replaces (same provider and scope); it is stored as not primary. */
  rotatesCredentialId: z.uuid().optional(),
} as const

/** `POST …/credentials`: a team or organization key (`vault:manage`). */
export const createCredentialInputSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('organization'), ...aiKeyBaseShape }),
  z.object({ scope: z.literal('team'), teamId: z.uuid(), ...aiKeyBaseShape }),
])
export type CreateCredentialInput = z.infer<typeof createCredentialInputSchema>

/**
 * `POST …/my-credentials`: a personal key, the "Just me" scope of Profile › API keys. Allowed only
 * when the access policy has `providers.personalKeys`.
 */
export const createPersonalCredentialInputSchema = z.object(aiKeyBaseShape)
export type CreatePersonalCredentialInput = z.infer<typeof createPersonalCredentialInputSchema>

/** `GET …/my-credentials`: the caller's own personal keys. */
export const listMyCredentialsQuerySchema = pageQuery
export type ListMyCredentialsQuery = z.infer<typeof listMyCredentialsQuerySchema>

/** `PATCH …/credentials/:credentialId`: label, expiry and, for local servers, the address. */
export const updateCredentialInputSchema = z
  .object({
    name: credentialNameSchema,
    expiresAt: z.iso.datetime().nullable(),
    baseUrl: baseUrlSchema,
  })
  .partial()
export type UpdateCredentialInput = z.infer<typeof updateCredentialInputSchema>

// ── Impact: what a revoke, switch or removal affects (T2 dialogs) ───────────────────────────────

export const CREDENTIAL_IMPACT_ACTIONS = ['revoke', 'switch'] as const
export type CredentialImpactAction = (typeof CREDENTIAL_IMPACT_ACTIONS)[number]

export const credentialImpactQuerySchema = z.object({ action: z.enum(CREDENTIAL_IMPACT_ACTIONS) })
export type CredentialImpactQuery = z.infer<typeof credentialImpactQuerySchema>

/** Most dependents listed by name; the counts cover all of them. */
export const IMPACT_LISTED_MAX = 50

/**
 * What depends on a key or server (from `dependency_edges` and this month's usage): agents, flows
 * and people, and the model each would fall back to ("3 agents will fall back to Llama 3.1 70B").
 */
export const credentialImpactDtoSchema = z.object({
  /** Dependents by type (`agent`, `flow`, `knowledge_base`, `model`…), counted. */
  dependents: z.array(z.object({ type: z.string(), count: z.number().int().nonnegative() })),
  listed: z
    .array(z.object({ type: z.string(), id: z.uuid(), name: z.string() }))
    .max(IMPACT_LISTED_MAX),
  /** People with usage on the key this month. */
  userCount: z.number().int().nonnegative(),
  /** The first allowed model of `vault_settings.fallback`; null when there is none. */
  fallback: z.object({ modelKey: z.string(), displayName: z.string() }).nullable(),
})
export type CredentialImpactDto = z.infer<typeof credentialImpactDtoSchema>

// ── Local servers ───────────────────────────────────────────────────────────────────────────────

const localServerBaseShape = {
  name: credentialNameSchema,
  providerKey: z.enum(LOCAL_SERVER_PROVIDER_KEYS),
  baseUrl: baseUrlSchema,
  /** Optional key some servers require. */
  secret: secretSchema.optional(),
} as const

/** `POST …/local-servers`: Save runs the connection test and stores the detected models (disabled). */
export const createLocalServerInputSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('organization'), ...localServerBaseShape }),
  z.object({ scope: z.literal('team'), teamId: z.uuid(), ...localServerBaseShape }),
])
export type CreateLocalServerInput = z.infer<typeof createLocalServerInputSchema>

/** `POST …/local-servers/:serverId/sync`: re-lists the server's models; the result is the detected list. */
export const localServerSyncDtoSchema = z.object({
  models: z.array(detectedModelDtoSchema).max(1000),
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
})
export type LocalServerSyncDto = z.infer<typeof localServerSyncDtoSchema>
