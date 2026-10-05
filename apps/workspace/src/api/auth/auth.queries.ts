// SPDX-License-Identifier: AGPL-3.0-only
import { queryOptions } from '@tanstack/react-query'

import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { authApi } from './auth.api'

export const authKeys = {
  all: () => ['me', 'auth'] as const,
  sessions: () => [...authKeys.all(), 'sessions'] as const,
  options: () => ['auth', 'options'] as const,
  invitation: (token: string) => ['auth', 'invitation', token] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const authQueries = {
  sessions: (http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: authKeys.sessions(),
      queryFn: ({ signal }) => authApi.sessions(http, signal),
    }),
  options: (http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: authKeys.options(),
      queryFn: ({ signal }) => authApi.options(http, signal),
      staleTime: 5 * 60 * 1000,
    }),
  invitation: (token: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: authKeys.invitation(token),
      queryFn: ({ signal }) => authApi.invitation(http, token, signal),
      retry: false,
    }),
}
