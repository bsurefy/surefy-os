// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { baseUrlSchema, credentialNameSchema, SEARCH_PROVIDER_KEYS } from '@surefy/contracts'

/**
 * Add search provider: SearXNG takes an address, Brave and Tavily a key. Which of the two is
 * needed depends on the provider, so the dialog checks it when testing.
 */
export const addSearchProviderFormSchema = z.object({
  providerKey: z.enum(SEARCH_PROVIDER_KEYS),
  name: credentialNameSchema,
  secret: z.string(),
  baseUrl: z.union([z.literal(''), baseUrlSchema]),
  expiresAt: z.string(),
})

export type AddSearchProviderFormValues = z.input<typeof addSearchProviderFormSchema>
