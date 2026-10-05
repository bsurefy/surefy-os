// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { catalogEntry, MODEL_CATALOG } from '../ai.catalog.js'

/** Models the provider's price list did not show when the prices were checked. */
const UNPRICED = new Set(['google/gemini-embedding-001'])

describe('model catalog prices', () => {
  it('prices every model in whole micros, with the day the price list was read', () => {
    for (const entry of MODEL_CATALOG) {
      const key = `${entry.providerKey}/${entry.providerModelId}`
      const { prices } = entry
      if (UNPRICED.has(key)) {
        expect(prices, key).toMatchObject({ inputPerMTokMicros: null, checkedOn: null })
        continue
      }
      expect(prices.checkedOn, key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(prices.currency, key).toBe('USD')
      expect(Number.isInteger(prices.inputPerMTokMicros), key).toBe(true)
      if (entry.type === 'chat') {
        expect(Number.isInteger(prices.outputPerMTokMicros), key).toBe(true)
        expect(prices.outputPerMTokMicros ?? 0, key).toBeGreaterThan(prices.inputPerMTokMicros ?? 0)
        // a cache hit never costs more than fresh input
        expect(prices.cachedInputPerMTokMicros ?? 0, key).toBeLessThan(
          prices.inputPerMTokMicros ?? 0,
        )
      } else {
        expect(prices.outputPerMTokMicros, key).toBeNull()
      }
    }
  })

  it('stores the list prices as micros per million tokens', () => {
    expect(catalogEntry('openai', 'gpt-4o-mini')?.prices).toMatchObject({
      inputPerMTokMicros: 150_000,
      outputPerMTokMicros: 600_000,
      cachedInputPerMTokMicros: 75_000,
    })
    expect(catalogEntry('anthropic', 'claude-opus-5-5')?.prices).toMatchObject({
      inputPerMTokMicros: 4_000_000,
      outputPerMTokMicros: 20_000_000,
      cachedInputPerMTokMicros: 200_000,
    })
  })

  it('has one entry per provider model', () => {
    const keys = MODEL_CATALOG.map((entry) => `${entry.providerKey}/${entry.providerModelId}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
