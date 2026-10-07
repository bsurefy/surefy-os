// SPDX-License-Identifier: AGPL-3.0-only
import { cache } from 'react'

import { createQueryClient } from './createQueryClient'

import type { QueryClientHandlers } from './query.types'
import type { QueryClient } from '@tanstack/react-query'

// React `cache()` scopes the client to one server request; it is never shared between requests.
const getServerQueryClient = cache(() => createQueryClient())

let browserQueryClient: QueryClient | undefined
let browserHandlers: QueryClientHandlers | undefined

/**
 * A new client per request on the server (it only prefetches, so no handlers), one client for
 * the whole session in the browser. The browser client outlives any one render, so it always
 * delegates to the handlers given last (the toast translator changes with the locale).
 */
export function getQueryClient(handlers?: QueryClientHandlers): QueryClient {
  if (typeof window === 'undefined') return getServerQueryClient()
  if (handlers) browserHandlers = handlers
  browserQueryClient ??= createQueryClient({
    onUnauthenticated: () => {
      browserHandlers?.onUnauthenticated()
    },
    onFeatureUnavailable: () => {
      browserHandlers?.onFeatureUnavailable()
    },
    showError: (error) => {
      browserHandlers?.showError(error)
    },
  })
  return browserQueryClient
}
