// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  connectionTestInputSchema,
  createSearchProviderInputSchema,
  searchProviderSettingsDtoSchema,
} from '../index.js'

describe('search provider contracts', () => {
  it('asks SearXNG for an address and Brave and Tavily for a key', () => {
    const create = createSearchProviderInputSchema
    expect(create.safeParse({ name: 'Metasearch', providerKey: 'searxng' }).success).toBe(false)
    expect(
      create.safeParse({
        name: 'Metasearch',
        providerKey: 'searxng',
        baseUrl: 'http://searxng:8080',
      }).success,
    ).toBe(true)
    expect(create.safeParse({ name: 'Brave', providerKey: 'brave' }).success).toBe(false)
    expect(
      create.safeParse({ name: 'Tavily', providerKey: 'tavily', secret: ' tvly-1 ' }),
    ).toMatchObject({ success: true, data: { secret: 'tvly-1' } })
    expect(create.safeParse({ name: 'Bing', providerKey: 'bing', secret: 'k' }).success).toBe(false)
  })

  it('tests a search provider with the same union as the other providers', () => {
    const test = connectionTestInputSchema
    expect(test.safeParse({ kind: 'search_provider', providerKey: 'brave' }).success).toBe(false)
    expect(
      test.safeParse({ kind: 'search_provider', providerKey: 'brave', secret: 'BSA-1' }).success,
    ).toBe(true)
    expect(test.safeParse({ kind: 'search_provider', providerKey: 'searxng' }).success).toBe(false)
    expect(
      test.safeParse({
        kind: 'search_provider',
        providerKey: 'searxng',
        baseUrl: 'http://searxng:8080',
      }).success,
    ).toBe(true)
  })

  it('answers with the providers and the one in use, or none', () => {
    expect(searchProviderSettingsDtoSchema.safeParse({ providers: [], active: null }).success).toBe(
      true,
    )
    expect(
      searchProviderSettingsDtoSchema.safeParse({
        providers: [],
        active: { providerKey: 'searxng', source: 'install', credentialId: null },
      }).success,
    ).toBe(true)
    expect(
      searchProviderSettingsDtoSchema.safeParse({
        providers: [],
        active: { providerKey: 'bing', source: 'vault', credentialId: null },
      }).success,
    ).toBe(false)
  })
})
