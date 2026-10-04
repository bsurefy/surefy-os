// SPDX-License-Identifier: AGPL-3.0-only
import { MutationObserver, useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ERROR_CODES } from '@surefy/contracts'

import { getQueryClient } from './getQueryClient'
import { QueryProvider } from './QueryProvider'
import { ApiError } from '../http/ApiError'

import type { QueryClientHandlers } from './query.types'

function createHandlers(): QueryClientHandlers {
  return { onUnauthenticated: vi.fn(), onFeatureUnavailable: vi.fn(), showError: vi.fn() }
}

function ClientProbe() {
  const client = useQueryClient()
  return <output>{client === getQueryClient() ? 'singleton' : 'other'}</output>
}

describe('QueryProvider', () => {
  it('provides the browser singleton client to its children', () => {
    render(
      <QueryProvider handlers={createHandlers()}>
        <ClientProbe />
      </QueryProvider>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('singleton')
  })

  it('routes errors to the handlers of the latest render', async () => {
    const first = createHandlers()
    const latest = createHandlers()
    const error = new ApiError(404, ERROR_CODES.NOT_FOUND, 'Not found')
    const { rerender } = render(<QueryProvider handlers={first}>child</QueryProvider>)
    rerender(<QueryProvider handlers={latest}>child</QueryProvider>)

    const observer = new MutationObserver(getQueryClient(), {
      mutationFn: () => Promise.reject(error),
    })
    await observer.mutate().catch(() => {
      // the rejection is expected; the handler call is what is tested
    })

    expect(first.showError).not.toHaveBeenCalled()
    expect(latest.showError).toHaveBeenCalledWith(error)
  })
})
