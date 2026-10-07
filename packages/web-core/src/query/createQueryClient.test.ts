// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { MutationObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { ERROR_CODES } from '@surefy/contracts'

import { createQueryClient, DEFAULT_STALE_TIME } from './createQueryClient'
import { ApiError } from '../http/ApiError'

import type { QueryClientHandlers } from './query.types'

function createHandlers(): QueryClientHandlers {
  return { onUnauthenticated: vi.fn(), onFeatureUnavailable: vi.fn(), showError: vi.fn() }
}

const unauthenticated = new ApiError(401, ERROR_CODES.AUTH_UNAUTHENTICATED, 'No session')
const gated = new ApiError(403, ERROR_CODES.FEATURE_NOT_AVAILABLE, 'Enterprise only')
const notFound = new ApiError(404, ERROR_CODES.NOT_FOUND, 'Not found')

function retryOf(client: ReturnType<typeof createQueryClient>) {
  const { retry } = client.getDefaultOptions().queries ?? {}
  if (typeof retry !== 'function') throw new TypeError('retry must be a function')
  return retry
}

async function failQuery(
  client: ReturnType<typeof createQueryClient>,
  error: Error,
  meta?: { errorToast?: boolean },
) {
  await client
    .query({ queryKey: ['q', meta], queryFn: () => Promise.reject(error), retry: false, meta })
    .catch(() => {
      // the rejection itself is expected; the cache callbacks are what is tested
    })
}

async function failMutation(
  client: ReturnType<typeof createQueryClient>,
  error: Error,
  meta?: { silent?: boolean },
) {
  const observer = new MutationObserver(client, { mutationFn: () => Promise.reject(error), meta })
  await observer.mutate().catch(() => {
    // same: only the cache callbacks matter here
  })
}

describe('createQueryClient defaults', () => {
  it('keeps hydrated data fresh for 30 seconds', () => {
    expect(createQueryClient().getDefaultOptions().queries?.staleTime).toBe(DEFAULT_STALE_TIME)
  })

  it('retries network errors and 5xx at most twice', () => {
    const retry = retryOf(createQueryClient())
    const serverError = new ApiError(503, ERROR_CODES.SERVICE_UNAVAILABLE, 'Down')

    expect(retry(0, ApiError.network(new Error('offline')))).toBe(true)
    expect(retry(1, serverError)).toBe(true)
    expect(retry(2, serverError)).toBe(false)
  })

  it('never retries a 4xx', () => {
    const retry = retryOf(createQueryClient())

    expect(retry(0, notFound)).toBe(false)
    expect(retry(0, unauthenticated)).toBe(false)
  })

  it('does not retry mutations', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBeUndefined()
  })
})

describe('createQueryClient global handlers', () => {
  it('runs without handlers, as on the server', async () => {
    await expect(failQuery(createQueryClient(), notFound)).resolves.toBeUndefined()
  })

  it('opens the session-expired dialog on AUTH_UNAUTHENTICATED and shows nothing else', async () => {
    const handlers = createHandlers()
    const client = createQueryClient(handlers)

    await failQuery(client, unauthenticated, { errorToast: true })
    await failMutation(client, unauthenticated)

    expect(handlers.onUnauthenticated).toHaveBeenCalledTimes(2)
    expect(handlers.showError).not.toHaveBeenCalled()
  })

  it('invalidates access on FEATURE_NOT_AVAILABLE and still notifies when asked', async () => {
    const handlers = createHandlers()
    const client = createQueryClient(handlers)

    await failQuery(client, gated)
    await failMutation(client, gated)

    expect(handlers.onFeatureUnavailable).toHaveBeenCalledTimes(2)
    expect(handlers.showError).toHaveBeenCalledTimes(1)
    expect(handlers.showError).toHaveBeenCalledWith(gated)
  })

  it('toasts a failed query only with meta.errorToast', async () => {
    const handlers = createHandlers()
    const client = createQueryClient(handlers)

    await failQuery(client, notFound)
    expect(handlers.showError).not.toHaveBeenCalled()

    await failQuery(client, notFound, { errorToast: true })
    expect(handlers.showError).toHaveBeenCalledWith(notFound)
  })

  it('toasts a failed mutation unless meta.silent is set', async () => {
    const handlers = createHandlers()
    const client = createQueryClient(handlers)

    await failMutation(client, notFound, { silent: true })
    expect(handlers.showError).not.toHaveBeenCalled()

    await failMutation(client, notFound)
    expect(handlers.showError).toHaveBeenCalledWith(notFound)
  })
})
