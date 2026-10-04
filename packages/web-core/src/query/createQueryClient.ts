// SPDX-License-Identifier: AGPL-3.0-only
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { ERROR_CODES } from '@surefy/contracts'

import { isApiError } from '../errors/isApiError'

import type { QueryClientHandlers } from './query.types'

/** Hydrated data is not refetched right after mount. */
export const DEFAULT_STALE_TIME = 30_000
const MAX_RETRIES = 2
const CLIENT_ERROR_MIN = 400
const CLIENT_ERROR_MAX = 500

function isClientError(error: unknown): boolean {
  return isApiError(error) && error.status >= CLIENT_ERROR_MIN && error.status < CLIENT_ERROR_MAX
}

/** The same behavior in every app. Without handlers (the server) it only caches and prefetches. */
export function createQueryClient(handlers?: QueryClientHandlers): QueryClient {
  function handleError(error: unknown, notify: boolean) {
    if (isApiError(error) && error.code === ERROR_CODES.AUTH_UNAUTHENTICATED) {
      // the session-expired dialog is the one message for this failure
      handlers?.onUnauthenticated()
      return
    }
    if (isApiError(error) && error.code === ERROR_CODES.FEATURE_NOT_AVAILABLE)
      handlers?.onFeatureUnavailable()
    if (notify) handlers?.showError(error)
  }

  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        handleError(error, query.meta?.errorToast === true)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        handleError(error, mutation.meta?.silent !== true)
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME,
        // retry network errors and 5xx at most twice; never retry a 4xx
        retry: (failureCount, error) => failureCount < MAX_RETRIES && !isClientError(error),
      },
      // mutations are not retried (TanStack's default), so nothing is set for them
    },
  })
}
