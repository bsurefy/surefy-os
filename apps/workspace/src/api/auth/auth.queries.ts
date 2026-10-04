// SPDX-License-Identifier: AGPL-3.0-only
import { queryOptions } from '@tanstack/react-query'

import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { authApi } from './auth.api'

export const authKeys = {
  all: () => ['me', 'auth'] as const,
  sessions: () => [...authKeys.all(), 'sessions'] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const authQueries = {
  sessions: (http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: authKeys.sessions(),
      queryFn: ({ signal }) => authApi.sessions(http, signal),
    }),
}
