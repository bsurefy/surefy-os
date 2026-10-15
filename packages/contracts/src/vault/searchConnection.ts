// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { baseUrlSchema, SEARCH_PROVIDER_KEYS, secretSchema } from './providers.js'

// The connection test of a search provider (searchProviders.ts has the rest of V1 web search).

/** SearXNG takes an address, Brave and Tavily an API key. */
export const SEARCH_PROVIDER_CREDENTIAL = {
  searxng: 'base_url',
  brave: 'secret',
  tavily: 'secret',
} as const satisfies Record<(typeof SEARCH_PROVIDER_KEYS)[number], 'base_url' | 'secret'>

/**
 * What a search connection test sends: SearXNG an address, Brave and Tavily a key. The tests ask
 * for one result of a harmless query.
 */
export const searchConnectionTestInputSchema = z
  .object({
    kind: z.literal('search_provider'),
    providerKey: z.enum(SEARCH_PROVIDER_KEYS),
    baseUrl: baseUrlSchema.optional(),
    secret: secretSchema.optional(),
  })
  .refine(
    (input) =>
      SEARCH_PROVIDER_CREDENTIAL[input.providerKey] === 'base_url'
        ? input.baseUrl !== undefined
        : input.secret !== undefined,
    { message: 'SearXNG needs an address; Brave and Tavily need a key', path: ['providerKey'] },
  )
export type SearchConnectionTestInput = z.infer<typeof searchConnectionTestInputSchema>
