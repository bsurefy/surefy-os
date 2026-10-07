// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor } from '@testing-library/react'
import { debounce, parseAsString, useQueryState } from 'nuqs'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from './renderWithProviders'

const DEBOUNCE_MS = 50

function SearchField() {
  const [q, setQ] = useQueryState('q', parseAsString.withDefault(''))
  return (
    <input
      type="search"
      aria-label="Search"
      value={q}
      onChange={(event) => {
        void setQ(event.target.value || null, { limitUrlUpdates: debounce(DEBOUNCE_MS) })
      }}
    />
  )
}

describe('TestProviders URL state', () => {
  it('keeps a debounced URL update instead of resetting to the initial URL', async () => {
    const { user } = renderWithProviders(<SearchField />)
    const field = screen.getByRole('searchbox', { name: 'Search' })

    await user.type(field, 'price')
    // wait past the debounce: a frozen adapter would reset the field to the initial URL here
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS * 4))

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('price')
    })
  })

  it('keeps every character when typing slower than the debounce', async () => {
    const urls: string[] = []
    const { user } = renderWithProviders(<SearchField />, {
      onUrlUpdate: ({ queryString }) => urls.push(queryString),
    })

    for (const character of 'abc') {
      await user.type(screen.getByRole('searchbox', { name: 'Search' }), character)
      await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS * 3))
    }

    expect(urls.at(-1)).toBe('?q=abc')
  })
})
