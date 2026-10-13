// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { buildEmbedSnippet, parseOrigins, parseSlackChannelIds } from './ChannelsSection.utils'

describe('parseOrigins', () => {
  it('keeps the origin of each address once, in the order typed', () => {
    expect(
      parseOrigins('https://acme.com/help\nhttp://localhost:8080, https://acme.com/shop  '),
    ).toEqual({ origins: ['https://acme.com', 'http://localhost:8080'], invalid: [] })
  })

  it('returns what is not a website address', () => {
    expect(parseOrigins('acme.com mailto:help@acme.com https://ok.acme.com')).toEqual({
      origins: ['https://ok.acme.com'],
      invalid: ['acme.com', 'mailto:help@acme.com'],
    })
  })

  it('finds nothing in blank text', () => {
    expect(parseOrigins(' \n ')).toEqual({ origins: [], invalid: [] })
  })
})

describe('parseSlackChannelIds', () => {
  it('splits on lines, commas and spaces and drops repeats', () => {
    expect(parseSlackChannelIds('C01\nC02, C01  C03')).toEqual(['C01', 'C02', 'C03'])
  })
})

describe('buildEmbedSnippet', () => {
  it('points the script at the API and fills in the token', () => {
    expect(buildEmbedSnippet('https://api.acme.com', 'wt_abc')).toBe(
      '<script src="https://api.acme.com/widget/v1/widget.js" data-token="wt_abc" async></script>',
    )
  })
})
