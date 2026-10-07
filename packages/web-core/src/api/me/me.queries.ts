// SPDX-License-Identifier: AGPL-3.0-only
import { queryOptions } from '@tanstack/react-query'

import { meApi } from './me.api'
import { apiClient } from '../../http/apiClient'

import type { HttpClient } from '../../http/http.types'

export const meKeys = {
  all: () => ['me'] as const,
  current: () => [...meKeys.all(), 'current'] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const meQueries = {
  current: (http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: meKeys.current(),
      queryFn: ({ signal }) => meApi.get(http, signal),
    }),
}
