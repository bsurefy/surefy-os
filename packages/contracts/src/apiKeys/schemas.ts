// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { userRefDtoSchema } from '../auth/schemas.js'
import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery, sortQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'
import { IMPACT_LISTED_MAX } from '../vault/schemas.js'

// Organization API keys: machine access to published agents and integrations (database/
// access-and-entitlements.md §2; Settings › API keys, and the Publish tab's API channel). Routes,
// all under /api/v1/orgs/:orgId/api-keys:
// GET / · POST / · GET/PATCH /:keyId · GET …/:keyId/impact · POST …/:keyId/revoke.
// The full key is returned once, by `POST /`; only its prefix is shown afterwards. Creating a key
// needs `api-keys:manage` and a fresh session.

/** Every key starts with this; the prefix shown in lists is `sk_` plus 8 characters of the random part. */
export const API_KEY_PREFIX = 'sk_'
export const API_KEY_DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8

/** `sk_` plus 43 base62 characters. */
export const API_KEY_SECRET_PATTERN = /^sk_[0-9A-Za-z]{43}$/

export const API_KEY_STATUSES = ['active', 'revoked'] as const
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number]

export const API_KEY_SCOPES_MAX = 50

export const apiKeyNameSchema = z.string().trim().min(1).max(100)

/**
 * A scope is a permission key (`agents:invoke`). The service checks that it exists, that the
 * creator holds it (`ACCESS_EXCEEDS_PARENT` otherwise) and that it is allowed for keys.
 */
export const apiKeyScopeSchema = z.string().regex(/^[a-z][a-z-]*:[a-z][a-z-]*$/)

/** A key can never manage keys: that stays with signed-in people. */
export const API_KEY_DENIED_SCOPE_RESOURCES = ['api-keys'] as const

export function isApiKeyScopeAllowed(scope: string): boolean {
  const resource = scope.split(':')[0] ?? ''
  return !(API_KEY_DENIED_SCOPE_RESOURCES as readonly string[]).includes(resource)
}

const scopesSchema = z
  .array(apiKeyScopeSchema)
  .min(1)
  .max(API_KEY_SCOPES_MAX)
  .refine((scopes) => new Set(scopes).size === scopes.length)

/**
 * A key as the list shows it. The secret and its hash are never returned. `isExpired` is computed
 * from `expiresAt`, never stored; an expired key is still `active` until someone revokes it.
 */
export const apiKeyDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** `sk_` plus the first 8 characters of the random part. */
  keyPrefix: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  status: z.enum(API_KEY_STATUSES),
  expiresAt: z.iso.datetime().nullable(),
  isExpired: z.boolean(),
  /** Buffered, so it can lag by a few minutes. */
  lastUsedAt: z.iso.datetime().nullable(),
  lastUsedIp: z.string().nullable(),
  /** Null after the creator's account is erased; the key belongs to the organization. */
  createdBy: userRefDtoSchema.nullable(),
  revokedAt: z.iso.datetime().nullable(),
  revokedBy: userRefDtoSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type ApiKeyDto = z.infer<typeof apiKeyDtoSchema>

export const apiKeyParamsSchema = orgParamsSchema.extend({ keyId: z.uuid() })
export type ApiKeyParams = z.infer<typeof apiKeyParamsSchema>

export const API_KEY_SORT_FIELDS = ['name', 'createdAt', 'lastUsedAt'] as const

export const listApiKeysQuerySchema = pageQuery.extend({
  q: searchQuery,
  status: multiValueQuery(z.enum(API_KEY_STATUSES)),
  sort: sortQuery(API_KEY_SORT_FIELDS),
})
export type ListApiKeysQuery = z.infer<typeof listApiKeysQuerySchema>

/** `POST …/api-keys`. The expiry is optional; when set it must be in the future. */
export const createApiKeyInputSchema = z.object({
  name: apiKeyNameSchema,
  scopes: scopesSchema,
  expiresAt: z.iso.datetime().optional(),
})
export type CreateApiKeyInput = z.infer<typeof createApiKeyInputSchema>

/** The only response that carries the full key ("You won't be able to see this key again"). */
export const apiKeyCreatedDtoSchema = z.object({
  apiKey: apiKeyDtoSchema,
  secret: z.string().regex(API_KEY_SECRET_PATTERN),
})
export type ApiKeyCreatedDto = z.infer<typeof apiKeyCreatedDtoSchema>

/** `PATCH …/:keyId`: the label only; scopes and expiry are fixed at creation. */
export const updateApiKeyInputSchema = z.object({ name: apiKeyNameSchema })
export type UpdateApiKeyInput = z.infer<typeof updateApiKeyInputSchema>

/**
 * What uses a key (from `dependency_edges`): the agents and channels published over the API
 * ("2 agents will stop answering API calls"). Counts cover all of them; names are capped.
 */
export const apiKeyImpactDtoSchema = z.object({
  dependents: z.array(z.object({ type: z.string(), count: z.number().int().nonnegative() })),
  listed: z
    .array(z.object({ type: z.string(), id: z.uuid(), name: z.string() }))
    .max(IMPACT_LISTED_MAX),
})
export type ApiKeyImpactDto = z.infer<typeof apiKeyImpactDtoSchema>
