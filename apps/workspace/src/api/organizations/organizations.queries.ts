// SPDX-License-Identifier: AGPL-3.0-only
import { queryOptions } from '@tanstack/react-query'

import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { organizationsApi } from './organizations.api'

/**
 * Query keys of the `organizations` domain (services-api.md §3): the organization's own settings.
 */
export const organizationKeys = {
  all: (orgId: string) => ['orgs', orgId, 'organizations'] as const,
  detail: (orgId: string) => [...organizationKeys.all(orgId), 'detail'] as const,
  slugAvailability: (slug: string) => ['organizations', 'slug-availability', slug] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const organizationQueries = {
  detail: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: organizationKeys.detail(orgId),
      queryFn: ({ signal }) => organizationsApi.get(http, orgId, signal),
    }),
  slugAvailability: (slug: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: organizationKeys.slugAvailability(slug),
      queryFn: ({ signal }) => organizationsApi.slugAvailability(http, slug, signal),
      staleTime: 30 * 1000,
    }),
}
