// SPDX-License-Identifier: AGPL-3.0-only
import { queryOptions } from '@tanstack/react-query'

import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { setupApi } from './setup.api'

/**
 * Query keys of the `setup` domain (services-api.md §3): the first-run status, before any
 * organization exists, and the organization's checklist.
 */
export const setupKeys = {
  all: () => ['setup'] as const,
  status: () => [...setupKeys.all(), 'status'] as const,
  checklist: (orgId: string) => ['orgs', orgId, 'setup', 'checklist'] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const setupQueries = {
  /** The Welcome step's checks run on every fetch, so nothing is cached: "Check again" refetches. */
  status: (http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: setupKeys.status(),
      queryFn: ({ signal }) => setupApi.status(http, signal),
      staleTime: 0,
      retry: false,
    }),
  checklist: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: setupKeys.checklist(orgId),
      queryFn: ({ signal }) => setupApi.checklist(http, orgId, signal),
    }),
}
