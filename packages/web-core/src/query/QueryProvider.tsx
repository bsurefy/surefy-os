// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import { getQueryClient } from './getQueryClient'

import type { QueryClientHandlers } from './query.types'
import type { ReactNode } from 'react'

export interface QueryProviderProps {
  /** Built by the app from the current `errors` translator and the session-expired store. */
  handlers: QueryClientHandlers
  children: ReactNode
}

/**
 * Mounted once per app, below the intl provider. The Query devtools float over the bottom-right
 * corner, where the composer's send button sits, so they are off unless a developer asks for them
 * with `NEXT_PUBLIC_QUERY_DEVTOOLS=true`.
 */
export function QueryProvider({ handlers, children }: Readonly<QueryProviderProps>) {
  // Not in useState: during SSR this is the request's client, in the browser the singleton,
  // and passing the handlers on every render keeps the singleton's translator current.
  const queryClient = getQueryClient(handlers)

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NEXT_PUBLIC_QUERY_DEVTOOLS === 'true' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  )
}
