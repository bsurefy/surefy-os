// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  baseUrlSchema,
  credentialNameSchema,
  SEARCH_PROVIDER_KEYS,
  secretSchema,
} from './providers.js'
import { credentialDtoSchema } from './schemas.js'

// Web search providers (V1; ai-architecture.md §3, backend/integrations.md §6, Settings › Vault ›
// Providers & keys › Search providers). A search provider is a `vault_credentials` row of kind
// `search_provider`, always at organization scope; one of them is primary and serves every web
// search of the organization. Routes, under /api/v1/orgs/:orgId/vault:
// GET /search-providers · POST /search-providers (Save runs the connection test itself) ·
// POST /connection-tests (kind `search_provider`) · the key actions of credentials.ts apply
// unchanged: GET/PATCH /credentials/:credentialId, POST …/{test,make-primary,revoke}.
// Who may search is not here: `AccessPolicy.tools.webSearch` switches web search per organization or
// team (Model access › web search per team). A search is possible when the policy allows it and
// `active` below is not null.

const searxngShape = {
  providerKey: z.literal('searxng'),
  name: credentialNameSchema,
  /** The instance's address, for example `http://searxng:8080`; the install's SearXNG service when it runs. */
  baseUrl: baseUrlSchema,
} as const

const keyedShape = {
  providerKey: z.enum(['brave', 'tavily']),
  name: credentialNameSchema,
  secret: secretSchema,
  /** Provider-side expiry when known; drives the "Key expiring" warning. */
  expiresAt: z.iso.datetime().optional(),
} as const

/** `POST …/search-providers`: Save requires a passing connection test; the first one becomes primary. */
export const createSearchProviderInputSchema = z.discriminatedUnion('providerKey', [
  z.object(searxngShape),
  z.object(keyedShape).extend({ providerKey: z.literal('brave') }),
  z.object(keyedShape).extend({ providerKey: z.literal('tavily') }),
])
export type CreateSearchProviderInput = z.infer<typeof createSearchProviderInputSchema>

/** Where the search provider in use comes from. */
export const SEARCH_PROVIDER_SOURCES = ['vault', 'install'] as const
export type SearchProviderSource = (typeof SEARCH_PROVIDER_SOURCES)[number]

/**
 * `GET …/search-providers`: the stored providers (primary first) and the one web search uses now.
 * `install` means no provider is stored but the install's SearXNG address (Settings › Install) is
 * set, so searches go there; `active` is null when nothing is set up and the composer's toggle
 * answers `CHAT_WEB_SEARCH_NOT_ALLOWED`.
 */
export const searchProviderSettingsDtoSchema = z.object({
  providers: z.array(credentialDtoSchema),
  active: z
    .object({
      providerKey: z.enum(SEARCH_PROVIDER_KEYS),
      source: z.enum(SEARCH_PROVIDER_SOURCES),
      /** The stored provider; null for the install's SearXNG address. */
      credentialId: z.uuid().nullable(),
    })
    .nullable(),
})
export type SearchProviderSettingsDto = z.infer<typeof searchProviderSettingsDtoSchema>
